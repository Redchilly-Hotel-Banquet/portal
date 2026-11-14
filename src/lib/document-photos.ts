/** A guest's identity document can have several photos. The first (the front) is kept in the guest's original fields; the rest are in `extraImages`. */
export type SideImage = { dataUrl: string; name: string; type: string; saved: string };
export const EMPTY_SIDE: SideImage = { dataUrl: "", name: "", type: "", saved: "" };

type WithPhotos = {
  imageDataUrl: string;
  imageName: string;
  imageType: string;
  savedImage: string;
  extraImages: SideImage[];
};

export const sideImage = (guest: WithPhotos, index: number): SideImage =>
  index === 0
    ? { dataUrl: guest.imageDataUrl, name: guest.imageName, type: guest.imageType, saved: guest.savedImage }
    : (guest.extraImages ?? [])[index - 1] ?? EMPTY_SIDE;

/** The change to apply to a guest to put `image` in photo slot `index`. */
export const withSideImage = (guest: WithPhotos, index: number, image: { dataUrl: string; name: string; type: string }): Partial<WithPhotos> => {
  if (index === 0) return { imageDataUrl: image.dataUrl, imageName: image.name, imageType: image.type };
  const extras = [...(guest.extraImages ?? [])];
  while (extras.length < index) extras.push({ ...EMPTY_SIDE });
  extras[index - 1] = { ...extras[index - 1], ...image };
  return { extraImages: extras };
};

/** Whether every photo this document asks for, except the ones marked optional, has been added. */
export const hasAllPhotos = (guest: WithPhotos, specs: Array<{ optional: boolean }>): boolean => {
  for (let i = 0; i < specs.length; i += 1) if (!specs[i].optional && !sideImage(guest, i).dataUrl) return false;
  return true;
};

/** What goes to the server for the extra photos: nothing for a photo that has not changed. */
export const extraImagePayload = (guest: WithPhotos, count: number, moved: boolean) => {
  const out: Array<{ dataUrl: string; name: string; type: string } | null> = [];
  let any = false;
  for (let i = 1; i < count; i += 1) {
    const side = sideImage(guest, i);
    const changed = Boolean(side.dataUrl) && (moved || side.dataUrl !== side.saved);
    out.push(changed ? { dataUrl: side.dataUrl, name: side.name || `photo-${i + 1}.jpg`, type: side.type || "image/jpeg" } : null);
    any = any || changed;
  }
  return any ? out : undefined;
};
