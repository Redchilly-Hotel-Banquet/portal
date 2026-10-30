import { toPng } from "html-to-image";

/** Saves what is on screen inside `node` as a PNG. Elements marked data-no-capture are left out. */
export async function downloadScreenshot(node: HTMLElement, fileName: string) {
  const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: background,
    filter: (element) => !(element instanceof HTMLElement && element.dataset.noCapture !== undefined),
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
