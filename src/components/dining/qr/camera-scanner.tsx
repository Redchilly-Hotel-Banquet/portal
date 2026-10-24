"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detected = { rawValue: string };
type Detector = { detect(source: CanvasImageSource): Promise<Detected[]> };
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

type ScanState = "idle" | "starting" | "scanning" | "denied" | "unsupported" | "error";

interface CameraScannerProps {
  /** Called with the decoded text. Return a message to reject it and keep scanning. */
  onDetect: (text: string) => string | void;
}

const getDetectorCtor = (): DetectorCtor | null =>
  typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
    : null;

export function CameraScanner({ onDetect }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const [state, setState] = useState<ScanState>("idle");
  const [hint, setHint] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    const Detector = getDetectorCtor();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setHint(null);
    setState("starting");
    try {
      const detector = new Detector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setState("scanning");

      let busy = false;
      timerRef.current = window.setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const found = await detector.detect(video);
          const value = found[0]?.rawValue;
          if (value) {
            const rejection = onDetectRef.current(value);
            if (rejection) setHint(rejection);
            else {
              stop();
              setState("idle");
            }
          }
        } catch {
          /* a failed frame is not fatal; try the next one */
        } finally {
          busy = false;
        }
      }, 300);
    } catch (error) {
      stop();
      const name = error instanceof DOMException ? error.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  };

  const active = state === "starting" || state === "scanning";
  const failed = state === "denied" || state === "unsupported" || state === "error";

  return (
    <div>
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-border bg-muted">
        <video ref={videoRef} muted playsInline aria-label="Camera preview" className={active ? "h-full w-full object-cover" : "hidden"} />
        {active && <span aria-hidden className="pointer-events-none absolute inset-[18%] rounded-md border border-brass" />}
        {!active && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            {failed ? (
              <CameraOff strokeWidth={1.75} className="h-6 w-6 text-muted-foreground" aria-hidden />
            ) : (
              <Camera strokeWidth={1.75} className="h-6 w-6 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm text-muted-foreground">
              {state === "denied" && "Camera access was blocked. Allow it in your browser settings, or enter the code manually."}
              {state === "unsupported" &&
                "This browser cannot scan QR codes on the page. Open your phone's camera app and point it at the code, or enter the code manually."}
              {state === "error" && "The camera could not be started. Enter the code manually instead."}
              {state === "idle" && "Point your camera at the QR code in your room or on your table."}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {active ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stop();
              setState("idle");
            }}
          >
            Stop camera
          </Button>
        ) : (
          state !== "unsupported" && (
            <Button type="button" onClick={start}>
              <Camera strokeWidth={1.75} aria-hidden />
              {failed ? "Try again" : "Start camera"}
            </Button>
          )
        )}
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {state === "starting" && "Starting camera"}
          {state === "scanning" && (hint ?? "Looking for a QR code")}
        </p>
      </div>
    </div>
  );
}
