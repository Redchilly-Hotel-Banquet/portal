/** A report as plain tables, so the Excel and PDF writers share one description of what to print. */
export type Column = { header: string; key: string; kind?: "text" | "number" | "money" };
export type Section = { title: string; columns: Column[]; rows: Array<Record<string, string | number>> };
export type ReportModel = { title: string; subtitle: string[]; sections: Section[] };
