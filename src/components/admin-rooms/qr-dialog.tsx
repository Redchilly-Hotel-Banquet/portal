"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadDataUrl, generateQrCard, printQrSheet } from "./qr";
import { buildQrUrl, qrFileName, qrLabel } from "./utils";
import type { RoomRecord } from "./types";

type Props = {
  room: RoomRecord | null;
  outletKey: string;
  onClose: () => void;
};

export function QrDialog({ room, outletKey, onClose }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setImage(null);
    setFailed(false);
    if (!room) return;
    const guestUrl = buildQrUrl(window.location.origin, room, outletKey);
    setUrl(guestUrl);
    let cancelled = false;
    generateQrCard(guestUrl, qrLabel(room, outletKey))
      .then((card) => !cancelled && setImage(card))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [room, outletKey]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  };

  const print = async () => {
    if (!room) return;
    const ok = await printQrSheet([{ url, label: qrLabel(room, outletKey), fileName: qrFileName(room, outletKey) }]);
    if (!ok) toast.error("The print window was blocked. Allow pop-ups for this site and try again.");
  };

  return (
    <Dialog open={!!room} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{room ? qrLabel(room, outletKey) : "QR code"}</DialogTitle>
          <DialogDescription>Guests who scan this code land on the {room?.type === "TABLE" ? "ordering" : "room services"} page for this location.</DialogDescription>
        </DialogHeader>

        <div className="flex aspect-[7/9] w-full max-w-[18rem] items-center justify-center self-center rounded-md border border-border bg-white">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={room ? `QR code for ${qrLabel(room, outletKey)}` : ""} className="h-full w-full object-contain" draggable={false} />
          ) : failed ? (
            <p className="px-4 text-center text-sm text-destructive">The QR code could not be generated.</p>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" strokeWidth={1.75} aria-label="Generating QR code" />
          )}
        </div>

        <div className="rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-all text-muted-foreground">{url}</div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copy}>
            <Copy strokeWidth={1.75} aria-hidden />
            Copy link
          </Button>
          <Button variant="outline" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
            <ExternalLink strokeWidth={1.75} aria-hidden />
            Test link
          </Button>
          <Button variant="outline" onClick={print} disabled={!image}>
            <Printer strokeWidth={1.75} aria-hidden />
            Print
          </Button>
          <Button onClick={() => room && image && downloadDataUrl(image, qrFileName(room, outletKey))} disabled={!image}>
            <Download strokeWidth={1.75} aria-hidden />
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
