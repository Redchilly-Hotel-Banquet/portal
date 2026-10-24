"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";

const HEIGHT = 200;

type Props = {
  /** Current signature as a PNG data URL ("" when empty). */
  value: string;
  /** Signature stored on the server, offered as a one-click restore. */
  savedValue?: string;
  onChange: (dataUrl: string) => void;
};

export function SignaturePad({ value, savedValue, onChange }: Props) {
  const padRef = useRef<SignatureCanvas | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string>("");
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setWidth(Math.floor(frame.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Redraw whenever the value is changed from outside the pad, or the canvas is resized.
  useEffect(() => {
    const pad = padRef.current;
    if (!pad || width === 0) return;
    if (value && value === lastEmitted.current && !pad.isEmpty()) return;
    pad.clear();
    if (!value) return;
    try {
      pad.fromDataURL(value, { width, height: HEIGHT });
    } catch {
      // A malformed stored image simply leaves the pad blank.
    }
  }, [value, width]);

  const capture = () => {
    const pad = padRef.current;
    if (!pad) return;
    const next = pad.isEmpty() ? "" : pad.toDataURL("image/png");
    lastEmitted.current = next;
    onChange(next);
  };

  const clear = () => {
    padRef.current?.clear();
    lastEmitted.current = "";
    onChange("");
  };

  return (
    <div className="space-y-3">
      <div ref={frameRef} className="overflow-hidden rounded-md border bg-white">
        {width > 0 ? (
          <SignatureCanvas
            ref={(instance) => {
              padRef.current = instance;
            }}
            penColor="#16110d"
            backgroundColor="#ffffff"
            canvasProps={{ width, height: HEIGHT, "aria-label": "Guest signature pad", className: "block touch-none" }}
            onEnd={capture}
          />
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        {savedValue && savedValue !== value ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(savedValue)}>
            Restore saved
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {value ? "Signature captured." : "Ask the guest to sign here during verification."}
        </p>
      </div>
    </div>
  );
}
