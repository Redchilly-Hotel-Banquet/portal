"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DiningHeading } from "../dining-heading";
import { locationLabel } from "../utils";
import { CameraScanner } from "./camera-scanner";
import { ManualEntry } from "./manual-entry";
import { parseScannedText, readLocationParams, resolveLocation, type LocationKind, type LocationRequest } from "./location-session";

type Phase =
  | { name: "input"; error?: string }
  | { name: "checking"; label: string }
  | { name: "done"; message: string };

type Prefill = { code?: string | null; type?: LocationKind; outletId?: string | null };

const REDIRECT_DELAY_MS = 900;
const MISSING_BRANCH = "This QR code does not say which branch it belongs to. Choose the branch below to continue.";

export function QrView() {
  const router = useRouter();
  const params = useSearchParams();
  const link = readLocationParams(params);
  const linkKey = `${link.type}:${link.code ?? ""}:${link.outletId ?? ""}`;

  const [phase, setPhase] = useState<Phase>(
    link.hasLocation ? { name: "checking", label: locationLabel(link.type, link.code) } : { name: "input" },
  );
  const [prefill, setPrefill] = useState<Prefill>(link.hasLocation ? { code: link.code, type: link.type, outletId: link.outletId } : {});
  const handled = useRef<string | null>(null);

  const run = useCallback(
    async (request: LocationRequest) => {
      setPhase({ name: "checking", label: locationLabel(request.type, request.code) });
      const result = await resolveLocation(request);
      if (result.ok === false) {
        setPrefill({ code: request.code, type: request.type, outletId: request.outletId });
        setPhase({ name: "input", error: result.message });
        // Asking for the ID is the expected next step, not a failure worth a toast.
        if (!result.needsCheckinId) toast.error(result.message);
        return;
      }
      if (result.warning) toast.error(result.warning);
      toast.success(result.welcome);
      setPhase({ name: "done", message: result.welcome });
      window.setTimeout(() => router.push("/menu"), REDIRECT_DELAY_MS);
    },
    [router],
  );

  // Deep link: /qr?room=101&outlet=... or /qr?table=A1&outlet=...
  useEffect(() => {
    if (!link.hasLocation || handled.current === linkKey) return;
    handled.current = linkKey;
    if (!link.outletId) {
      setPrefill({ code: link.code, type: link.type });
      setPhase({ name: "input", error: MISSING_BRANCH });
      return;
    }
    void run({ code: link.code as string, type: link.type, outletId: link.outletId });
  }, [link.hasLocation, link.code, link.type, link.outletId, linkKey, run]);

  const onDetect = (text: string) => {
    const parsed = parseScannedText(text);
    if (!parsed) return "That is not a Red Chilly room or table code. Keep scanning.";
    if (!parsed.outletId) {
      setPrefill({ code: parsed.code, type: parsed.type });
      setPhase({ name: "input", error: MISSING_BRANCH });
      return;
    }
    void run({ code: parsed.code, type: parsed.type, outletId: parsed.outletId });
  };

  return (
    <>
      <DiningHeading
        eyebrow="Dining"
        title="Order to your room or table"
        description="Scan the QR code in your room or on your table to open the menu for your location. If scanning is not possible, enter the number printed on the card."
      />

      <div className="page-container py-10 md:py-14">
        <div aria-live="polite">
          {phase.name === "checking" && (
            <div className="mb-8 flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
              <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin text-primary" aria-hidden />
              <p>
                Confirming <span className="font-medium">{phase.label}</span>
              </p>
            </div>
          )}
          {phase.name === "done" && (
            <div className="mb-8 flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden />
              <p>{phase.message} Opening the menu.</p>
            </div>
          )}
          {phase.name === "input" && phase.error && (
            <div role="alert" className="mb-8 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{phase.error}</p>
            </div>
          )}
        </div>

        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <section aria-labelledby="scan-title">
            <p className="eyebrow">Option one</p>
            <h2 id="scan-title" className="mt-2 text-2xl tracking-tight">
              Scan with camera
            </h2>
            <div className="mt-6">
              <CameraScanner onDetect={onDetect} />
            </div>
          </section>

          <section aria-labelledby="manual-title">
            <p className="eyebrow">Option two</p>
            <h2 id="manual-title" className="mt-2 text-2xl tracking-tight">
              Enter the code
            </h2>
            <div className="mt-6 max-w-md">
              <ManualEntry
                key={`${prefill.type}:${prefill.code}:${prefill.outletId}`}
                initial={prefill}
                busy={phase.name !== "input"}
                onSubmit={(request) => void run(request)}
              />
            </div>
          </section>
        </div>

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          Only want to look?{" "}
          <Button asChild variant="link" className="h-auto p-0">
            <Link href="/menu">Browse the menu</Link>
          </Button>{" "}
          without ordering.
        </p>
      </div>
    </>
  );
}
