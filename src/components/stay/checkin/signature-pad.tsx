"use client";

import { useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

// The signature surface is always light paper with dark ink, independent of the site theme,
// so the saved image stays legible for front-desk staff in either theme.
const PAPER = "hsl(40 33% 97%)";
const MUTED = "hsl(24 8% 38%)";

const exportOnPaper = (source: HTMLCanvasElement) => {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source.toDataURL("image/png");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  return out.toDataURL("image/png");
};

/** Touch-friendly signature capture. Loaded client-only by the signature step. */
export default function SignaturePad({ value, onChange }: SignaturePadProps) {
  const ref = useRef<SignatureCanvas>(null);
  // The last value this pad produced itself, so only outside changes (profile autofill) redraw.
  const emitted = useRef<string | null>(value);

  // Draw a value that arrived from outside, once the canvas has been sized.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const pad = ref.current;
    const canvas = pad?.getCanvas();
    if (!pad || !canvas) return;
    pad.clear();
    if (value) pad.fromDataURL(value, { width: canvas.offsetWidth, height: canvas.offsetHeight });
  }, [value]);

  // Restore a previously saved signature at mount.
  useEffect(() => {
    const pad = ref.current;
    const canvas = pad?.getCanvas();
    if (pad && canvas && value) {
      pad.fromDataURL(value, { width: canvas.offsetWidth, height: canvas.offsetHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnd = () => {
    const pad = ref.current;
    const next = !pad || pad.isEmpty() ? null : exportOnPaper(pad.getCanvas());
    emitted.current = next;
    onChange(next);
  };

  const clear = () => {
    ref.current?.clear();
    emitted.current = null;
    onChange(null);
  };

  return (
    <div>
      <div className="relative h-48 w-full border border-input sm:h-56" style={{ backgroundColor: PAPER }}>
        <SignatureCanvas
          ref={ref}
          onEnd={handleEnd}
          clearOnResize={false}
          penColor="#1c1713"
          minWidth={0.8}
          maxWidth={2.4}
          canvasProps={{
            className: "absolute inset-0 h-full w-full touch-none",
            "aria-label": "Signature area. Draw with a finger, stylus or mouse.",
          }}
        />
        {!value && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs" style={{ color: MUTED }}>
            Sign above the line
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b" style={{ borderColor: MUTED }} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!value}>
          <Eraser className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Clear
        </Button>
      </div>
    </div>
  );
}
