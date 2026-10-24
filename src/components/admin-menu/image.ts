/** Client-side image compression so uploads stay well under Vercel's 4.5 MB request cap. */

const MAX_DATA_URL_BYTES = 900_000;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });

const render = (img: HTMLImageElement, maxEdge: number, quality: number) => {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not available in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
};

/** Returns a JPEG data URL, max 1280px on the longest edge. Throws a user-friendly Error if it cannot fit. */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const img = await loadImage(file);
  for (const [edge, quality] of [[1280, 0.8], [1024, 0.7], [800, 0.6]] as const) {
    const out = render(img, edge, quality);
    if (out.length <= MAX_DATA_URL_BYTES) return out;
  }
  throw new Error("This image is too large even after compression. Please choose a smaller one.");
}
