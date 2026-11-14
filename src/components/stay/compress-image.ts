/** Vercel caps request bodies at ~4.5MB, so images are downscaled in the browser before upload. */

const MAX_EDGE = 1280;
const QUALITY = 0.8;

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
      reject(new Error("That file could not be read as an image. Please choose a JPG or PNG photo."));
    };
    img.src = url;
  });

export interface CompressedImage {
  dataUrl: string;
  name: string;
  type: string;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG or PNG).");
  }
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", QUALITY),
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    type: "image/jpeg",
  };
}

/** Turns a photo a quarter turn (clockwise by default), for a document photographed sideways. Returns a new JPEG. */
export async function rotateImage(dataUrl: string, name: string, clockwise = true): Promise<CompressedImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That photo could not be turned."));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return { dataUrl: canvas.toDataURL("image/jpeg", QUALITY), name: name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
}
