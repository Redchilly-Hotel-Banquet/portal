import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Column, ReportModel } from "./report-model";

const sheetName = (title: string, used: Set<string>) => {
  let name = title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
};

export async function writeXlsx(model: ReportModel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Red Chilly";
  workbook.created = new Date();
  const used = new Set<string>();

  const overview = workbook.addWorksheet(sheetName("Report", used));
  overview.addRow([model.title]).font = { bold: true, size: 14 };
  for (const line of model.subtitle) overview.addRow([line]);
  overview.getColumn(1).width = 70;

  for (const section of model.sections) {
    const sheet = workbook.addWorksheet(sheetName(section.title, used));
    sheet.addRow(section.columns.map((column) => column.header)).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE6D8" } };
    });
    for (const row of section.rows) sheet.addRow(section.columns.map((column) => row[column.key] ?? ""));
    section.columns.forEach((column, index) => {
      const col = sheet.getColumn(index + 1);
      const longest = Math.max(column.header.length, ...section.rows.map((row) => String(row[column.key] ?? "").length));
      col.width = Math.min(Math.max(longest + 2, 10), 50);
      if (column.kind === "money") col.numFmt = '"₹"#,##0.00';
      if (column.kind === "number") col.numFmt = "#,##0";
      if (column.kind && column.kind !== "text") col.alignment = { horizontal: "right" };
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ----------------------------------- PDF ----------------------------------- */

const PAGE = { width: 842, height: 595, margin: 36 }; // A4 landscape
const ROW = 16;

/** The built-in PDF fonts cannot print the rupee sign, so money is written "Rs 1,234.00" in PDFs. */
const clean = (value: string) => value.replace(/₹/g, "Rs ").replace(/[^\x20-\x7E -ÿ]/g, "?");
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (value: string | number | undefined, column: Column): string => {
  if (value === undefined || value === "") return "";
  if (column.kind === "money") return `Rs ${inr.format(Number(value))}`;
  if (column.kind === "number") return new Intl.NumberFormat("en-IN").format(Number(value));
  return clean(String(value));
};

const fit = (text: string, font: PDFFont, size: number, width: number): string => {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width) out = out.slice(0, -1);
  return `${out}...`;
};

export async function writePdf(model: ReportModel): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.1, 0.08);
  const muted = rgb(0.4, 0.37, 0.34);
  const usable = PAGE.width - PAGE.margin * 2;

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
  };
  const need = (height: number) => {
    if (y - height < PAGE.margin) newPage();
  };

  page.drawText(clean(model.title), { x: PAGE.margin, y: y - 14, size: 16, font: bold, color: ink });
  y -= 24;
  for (const line of model.subtitle) {
    page.drawText(clean(line), { x: PAGE.margin, y: y - 10, size: 9, font, color: muted });
    y -= 13;
  }
  y -= 8;

  for (const section of model.sections) {
    need(ROW * 3);
    page.drawText(clean(section.title), { x: PAGE.margin, y: y - 12, size: 12, font: bold, color: ink });
    y -= 20;
    if (section.rows.length === 0) {
      page.drawText("Nothing recorded.", { x: PAGE.margin, y: y - 10, size: 9, font, color: muted });
      y -= ROW + 8;
      continue;
    }

    // Column widths: proportional to the longest text, within the page.
    const weights = section.columns.map((column) =>
      Math.min(Math.max(column.header.length, ...section.rows.slice(0, 200).map((row) => cell(row[column.key], column).length)), 40),
    );
    const total = weights.reduce((sum, weight) => sum + weight + 2, 0);
    const widths = weights.map((weight) => ((weight + 2) / total) * usable);

    const drawHeader = () => {
      page.drawRectangle({ x: PAGE.margin, y: y - ROW + 3, width: usable, height: ROW, color: rgb(0.94, 0.9, 0.85) });
      let x = PAGE.margin;
      section.columns.forEach((column, index) => {
        const text = fit(clean(column.header), bold, 8, widths[index] - 6);
        const right = column.kind === "money" || column.kind === "number";
        page.drawText(text, { x: right ? x + widths[index] - 3 - bold.widthOfTextAtSize(text, 8) : x + 3, y: y - 8, size: 8, font: bold, color: ink });
        x += widths[index];
      });
      y -= ROW;
    };

    need(ROW * 3);
    drawHeader();
    for (const row of section.rows) {
      if (y - ROW < PAGE.margin) {
        newPage();
        drawHeader();
      }
      let x = PAGE.margin;
      section.columns.forEach((column, index) => {
        const text = fit(cell(row[column.key], column), font, 8, widths[index] - 6);
        const right = column.kind === "money" || column.kind === "number";
        page.drawText(text, { x: right ? x + widths[index] - 3 - font.widthOfTextAtSize(text, 8) : x + 3, y: y - 8, size: 8, font, color: ink });
        x += widths[index];
      });
      page.drawLine({ start: { x: PAGE.margin, y: y - ROW + 3 }, end: { x: PAGE.margin + usable, y: y - ROW + 3 }, thickness: 0.3, color: rgb(0.85, 0.82, 0.78) });
      y -= ROW;
    }
    y -= 14;
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) =>
    p.drawText(`Page ${index + 1} of ${pages.length}`, { x: PAGE.width - PAGE.margin - 60, y: 18, size: 8, font, color: muted }),
  );
  return Buffer.from(await pdf.save());
}

/* ----------------------------------- CSV ----------------------------------- */

const csvField = (value: string | number | undefined) => {
  const text = String(value ?? "");
  // A leading = + - @ would be read as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One file with every section in turn, each under its own heading. A byte-order mark makes Excel read it as UTF-8. */
export function writeCsv(model: ReportModel): Buffer {
  const lines: string[] = [csvField(model.title), ...model.subtitle.map(csvField)];
  for (const section of model.sections) {
    lines.push("", csvField(section.title), section.columns.map((column) => csvField(column.header)).join(","));
    for (const row of section.rows) lines.push(section.columns.map((column) => csvField(row[column.key])).join(","));
  }
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}
