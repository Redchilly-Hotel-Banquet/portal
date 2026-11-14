"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/apiClient";
import { formatPhone } from "@/lib/phone";

type Row = Record<string, any>;
type Outcome = { ok: true; data: Row; message?: undefined } | { ok: false; message: string; data?: undefined };
type Scan = { at: Date; label: string; ok: boolean; reward?: string };

const discountText = (config?: Row) => (config?.mode === "visits" ? "" : config?.discountType === "price" ? `₹${Number(config.discountValue || 0).toLocaleString("en-IN")} off` : `${Number(config?.discountValue || 0)}% off`);

/** Staff scan a customer's reward QR here: reading it marks the reward as used and shows what to give. */
export function LoyaltyScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number>(0);
  const locked = useRef(false); // true while a scan is being handled, so one QR is not sent twice
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off");
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [manual, setManual] = useState("");
  const [recent, setRecent] = useState<Scan[]>([]);

  const redeem = useCallback(async (text: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    let result: Outcome;
    try {
      const response = await apiPost<{ data?: Row } & Row>("/admin/loyalty-scan", { code: text }, true);
      const data = (response.data ?? response) as Row;
      result = { ok: true, data };
      setRecent((prev) => [{ at: new Date(), label: data.orderId || "Reward", ok: true, reward: data.customer?.reward || data.reward }, ...prev].slice(0, 10));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read that QR code.";
      result = { ok: false, message };
      setRecent((prev) => [{ at: new Date(), label: message, ok: false }, ...prev].slice(0, 10));
    }
    setOutcome(result);
    setBusy(false);
    // stays locked until staff press "Scan next", so a QR held in front of the camera is read once
    if (navigator.vibrate) navigator.vibrate(result.ok ? 80 : [60, 40, 60]);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera("off");
  }, []);

  const tick = useCallback(() => {
    const v = video.current, c = canvas.current;
    if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && !locked.current) {
      const scale = Math.min(1, 640 / v.videoWidth);
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const found = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
        if (found?.data) void redeem(found.data);
      }
    }
    frame.current = requestAnimationFrame(tick);
  }, [redeem]);

  const start = useCallback(async () => {
    setCameraError("");
    setCamera("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use the camera here. Use the box below to paste the QR's link instead.");
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setCamera("on");
      frame.current = requestAnimationFrame(tick);
    } catch (error) {
      stop();
      setCameraError(error instanceof Error && error.name === "NotAllowedError" ? "Camera permission was refused. Allow the camera for this site, or paste the QR's link below." : error instanceof Error ? error.message : "The camera could not be started.");
    }
  }, [stop, tick]);

  useEffect(() => () => stop(), [stop]);

  const next = () => { setOutcome(null); locked.current = false; };

  return (
    <AdminShell scope={["admin", "loyalty"]} title="Scan reward QR" description="Scan a customer's reward QR to redeem it and see what to give them.">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="relative aspect-square overflow-hidden rounded-md bg-black">
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={canvas} className="hidden" />
            {camera === "on" ? <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80" aria-hidden /> : null}
            {camera !== "on" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
                {camera === "starting" ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden /> : <ScanLine className="h-10 w-10" strokeWidth={1.5} aria-hidden />}
                <p className="text-sm">{camera === "starting" ? "Starting the camera…" : "Start the camera, then hold the customer's QR inside the frame."}</p>
              </div>
            ) : null}
            {busy ? <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 className="h-10 w-10 animate-spin text-white" aria-label="Checking the QR" /></div> : null}
          </div>
          {cameraError ? <p role="alert" className="text-sm text-destructive">{cameraError}</p> : null}
          <div className="flex flex-wrap gap-2">
            {camera === "on" ? (
              <Button type="button" variant="outline" onClick={stop}><CameraOff className="mr-2 h-4 w-4" aria-hidden />Stop camera</Button>
            ) : (
              <Button type="button" onClick={() => void start()} disabled={camera === "starting"}><Camera className="mr-2 h-4 w-4" aria-hidden />Start camera</Button>
            )}
          </div>
          <form className="space-y-1.5 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); if (manual.trim()) { void redeem(manual.trim()); setManual(""); } }}>
            <label htmlFor="manual-code" className="text-sm font-medium">No camera? Paste the QR's link or code</label>
            <div className="flex gap-2">
              <Input id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…/reward/verify?code=…" autoComplete="off" />
              <Button type="submit" variant="outline" disabled={busy || !manual.trim() || locked.current}>Redeem</Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          {outcome ? (
            <div role="status" className={`rounded-lg border p-5 ${outcome.ok ? "border-green-600/40 bg-green-600/10" : "border-destructive/40 bg-destructive/10"}`}>
              {outcome.ok ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-6 w-6" aria-hidden /><h2 className="font-display text-2xl">Redeemed</h2></div>
                  <p className="rounded-md border border-dashed border-primary bg-background p-3 text-center font-display text-xl text-primary">{outcome.data.customer?.reward || outcome.data.reward}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {outcome.data.customer?.customerName ? <><dt className="text-muted-foreground">Customer</dt><dd>{outcome.data.customer.customerName}</dd></> : null}
                    {outcome.data.customer?.phone ? <><dt className="text-muted-foreground">Phone</dt><dd>{formatPhone(`+${outcome.data.customer.phone}`)}</dd></> : null}
                    {discountText(outcome.data.rewardConfig) ? <><dt className="text-muted-foreground">Discount</dt><dd>{discountText(outcome.data.rewardConfig)}</dd></> : null}
                    {outcome.data.rewardConfig?.mode === "visits" ? <><dt className="text-muted-foreground">Visits</dt><dd>{outcome.data.customer?.unlocked ? "Target reached: give the reward" : `${outcome.data.customer?.visitCount} of ${outcome.data.customer?.visitTarget}`}</dd></> : null}
                    <dt className="text-muted-foreground">Order</dt><dd>{outcome.data.orderId}</dd>
                  </dl>
                  <p className="text-sm text-muted-foreground">This QR is now used and cannot be scanned again.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive"><XCircle className="h-6 w-6" aria-hidden /><h2 className="font-display text-2xl">Not redeemed</h2></div>
                  <p className="text-sm">{outcome.message}</p>
                </div>
              )}
              <Button type="button" className="mt-4" onClick={next}>Scan next</Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Scan a QR to see the result here.</div>
          )}

          {recent.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-lg">Scanned in this session</h3>
              <ul className="mt-2 divide-y divide-border text-sm">
                {recent.map((scan, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{scan.ok ? `${scan.label}${scan.reward ? `: ${scan.reward}` : ""}` : scan.label}</span>
                    <span className={`shrink-0 text-xs ${scan.ok ? "text-green-600" : "text-destructive"}`}>{scan.ok ? "Redeemed" : "Failed"} · {scan.at.toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </AdminShell>
  );
}
