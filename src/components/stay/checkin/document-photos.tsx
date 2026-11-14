"use client";

import { useRef, useState } from "react";
import { ImagePlus, RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImage, rotateImage } from "@/components/stay/compress-image";
import type { SideImage } from "@/lib/document-photos";
import type { PhotoSpec } from "@/lib/document-types";

type Props = {
  id: string;
  /** The guest, for the screen-reader labels. */
  who: string;
  /** What each photo is called: ["Front", "Back"] for a card, ["Photo page"] for a passport. */
  sides: PhotoSpec[];
  images: SideImage[];
  /** Photos are not required here (reception can leave them out). */
  optional?: boolean;
  onChange: (index: number, image: { dataUrl: string; name: string; type: string }) => void;
  onPreview?: (preview: { src: string; name: string }) => void;
};

/** One upload slot per photo the chosen document asks for. */
export function DocumentPhotos({ id, who, sides, images, optional, onChange, onPreview }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [busy, setBusy] = useState<number | null>(null);

  // A photo taken sideways can be turned a quarter turn either way before it is saved.
  const rotate = async (index: number, clockwise: boolean) => {
    const image = images[index];
    if (!image?.dataUrl) return;
    setBusy(index);
    try {
      const turned = await rotateImage(image.dataUrl, image.name || `photo-${index + 1}`, clockwise);
      onChange(index, { dataUrl: turned.dataUrl, name: turned.name, type: turned.type });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to turn that photo");
    } finally {
      setBusy(null);
    }
  };

  const pick = async (index: number, file: File | undefined) => {
    if (!file) return;
    setBusy(index);
    try {
      const image = await compressImage(file);
      onChange(index, { dataUrl: image.dataUrl, name: image.name, type: image.type });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read that image");
    } finally {
      setBusy(null);
      const input = refs.current[index];
      if (input) input.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {sides.length > 1 ? `Photos of the document (${sides.length})` : "Photo of the document"}
        {optional || sides.every((s) => s.optional) ? <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span> : <span aria-hidden="true" className="ml-1 text-primary">*</span>}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {sides.map((spec, index) => {
          const side = spec.label;
          const image = images[index];
          return (
            <div key={`${side}-${index}`} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{side}{spec.optional ? <span className="ml-1 font-normal">(optional)</span> : null}</p>
              <div className="flex flex-wrap items-center gap-3">
                {image?.dataUrl ? (
                  <button
                    type="button"
                    onClick={() => onPreview?.({ src: image.dataUrl, name: `${who} — ${side}` })}
                    disabled={!onPreview}
                    className="rounded-sm border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Enlarge ${who} ${side} photo`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                    <img src={image.dataUrl} alt={`${side} of the identity document for ${who}`} className="h-16 w-24 rounded-sm object-cover" />
                  </button>
                ) : (
                  <div className="flex h-16 w-24 items-center justify-center rounded-sm border border-dashed text-muted-foreground">
                    <ImagePlus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </div>
                )}
                <input
                  ref={(el) => { refs.current[index] = el; }}
                  id={`${id}-file-${index}`}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={`${who} ${side} photo file`}
                  onChange={(e) => void pick(index, e.target.files?.[0])}
                />
                <Button type="button" variant="outline" size="sm" disabled={busy === index} onClick={() => refs.current[index]?.click()}>
                  <ImagePlus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {busy === index ? "Processing" : image?.dataUrl ? "Replace" : "Upload"}
                </Button>
                {image?.dataUrl ? (
                  <span className="flex gap-1">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={busy === index} aria-label={`Turn the ${side} photo of ${who} anticlockwise`} onClick={() => void rotate(index, false)}>
                      <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={busy === index} aria-label={`Turn the ${side} photo of ${who} clockwise`} onClick={() => void rotate(index, true)}>
                      <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </Button>
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
