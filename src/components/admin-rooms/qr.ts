/**
 * Branded QR card generation: logo on top, QR in the middle, label below.
 * Browser-only (canvas). qrcode and jszip are loaded on demand.
 */

const LOGO_URL = "/logo.jpeg";
const CARD_W = 1400;
const CARD_H = 1800;
const PADDING = 60;
const HEADER_H = 260;
const FOOTER_H = 220;

const cache = new Map<string, string>();

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });

function drawCenteredText(ctx: CanvasRenderingContext2D, text: string, xCenter: number, yTop: number, maxWidth: number, lineHeight: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  let y = yTop;
  for (const line of lines) {
    ctx.fillText(line, xCenter - ctx.measureText(line).width / 2, y);
    y += lineHeight;
  }
}

async function composeCard(qrDataUrl: string, label: string): Promise<string> {
  const qrAreaTop = PADDING + HEADER_H + PADDING;
  const qrAreaHeight = CARD_H - (PADDING + FOOTER_H + PADDING) - qrAreaTop;
  const qrSize = Math.min(CARD_W - PADDING * 2, qrAreaHeight);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  try {
    const logo = await loadImage(LOGO_URL);
    const ratio = Math.min((CARD_W * 0.55) / logo.width, (HEADER_H * 0.8) / logo.height);
    const w = Math.max(1, Math.floor(logo.width * ratio));
    const h = Math.max(1, Math.floor(logo.height * ratio));
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, (CARD_W - w) / 2, PADDING + (HEADER_H - h) / 2, w, h);
  } catch {
    // A missing logo must never block the QR itself.
  }

  const qrImg = await loadImage(qrDataUrl);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImg, (CARD_W - qrSize) / 2, qrAreaTop + (qrAreaHeight - qrSize) / 2, qrSize, qrSize);

  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  ctx.font = "bold 64px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  drawCenteredText(ctx, label, CARD_W / 2, CARD_H - (PADDING + FOOTER_H) + 20, CARD_W - PADDING * 2, 80);

  return canvas.toDataURL("image/png");
}

/** Returns a printable PNG data URL for the given guest URL and caption. */
export async function generateQrCard(url: string, label: string): Promise<string> {
  const key = `${url}::${label}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { default: QRCode } = await import("qrcode");
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 1024,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFFFF" },
  });
  const card = await composeCard(qrDataUrl, label);
  cache.set(key, card);
  return card;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type QrCardInput = { url: string; label: string; fileName: string };

export async function downloadQrZip(items: QrCardInput[], onProgress?: (done: number, total: number) => void) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  let done = 0;
  for (const item of items) {
    const card = await generateQrCard(item.url, item.label);
    let name = item.fileName;
    for (let i = 2; used.has(name); i++) name = item.fileName.replace(/\.png$/, `-${i}.png`);
    used.add(name);
    zip.file(name, card.split(",")[1], { base64: true });
    onProgress?.(++done, items.length);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  downloadDataUrl(objectUrl, `qr-codes-${new Date().toISOString().slice(0, 10)}.zip`);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Opens a print-ready sheet in a new window: four cards per A4 page.
 * Returns false when the browser blocked the pop-up.
 */
export async function printQrSheet(items: QrCardInput[], onProgress?: (done: number, total: number) => void): Promise<boolean> {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write("<!doctype html><title>Preparing QR sheet</title><p style=\"font:14px system-ui\">Preparing QR sheet...</p>");
  try {
    const cards: string[] = [];
    let done = 0;
    for (const item of items) {
      const src = await generateQrCard(item.url, item.label);
      cards.push(`<figure><img src="${src}" alt="${escapeHtml(item.label)}"></figure>`);
      onProgress?.(++done, items.length);
    }
    win.document.open();
    win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QR codes</title><style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; }
      main { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
      figure { margin: 0; break-inside: avoid; border: 0.2mm dashed #999; }
      img { display: block; width: 100%; height: auto; }
    </style></head><body><main>${cards.join("")}</main></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
    return true;
  } catch (err) {
    win.close();
    throw err;
  }
}
