"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/components/stay/compress-image";
import { DOCUMENT_TYPES } from "@/components/stay/checkin/types";
import { guestStatus, isGuestComplete, MAX_ADMIN_GUESTS, type AdminGuest, type Completeness } from "./checkin-guests";
import { SignaturePad } from "./signature-pad";

const STATUS_LABEL: Record<Completeness, string> = {
  complete: "Complete",
  "missing-details": "Missing details",
  "missing-photo": "Missing photo",
  "missing-signature": "Missing signature",
};

type Preview = { src: string; name: string };

type CardProps = {
  guest: AdminGuest;
  index: number;
  removable: boolean;
  onChange: (patch: Partial<AdminGuest>) => void;
  onRemove: () => void;
  onPreview: (preview: Preview) => void;
};

function GuestCard({ guest, index, removable, onChange, onRemove, onPreview }: CardProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const status = guestStatus(guest);
  const id = `guest-${guest.key}`;
  const placeholder = DOCUMENT_TYPES.find((type) => type.value === guest.documentType)?.placeholder ?? "Document number";
  const label = guest.fullName.trim() || `Guest ${index + 1}`;
  const showPad = drawing || !guest.signature;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const image = await compressImage(file);
      onChange({ imageDataUrl: image.dataUrl, imageName: image.name, imageType: image.type });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to read that image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <li className="space-y-4 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Guest {index + 1}</p>
        <div className="flex items-center gap-2">
          <Badge variant={status === "complete" ? "secondary" : "outline"}>{STATUS_LABEL[status]}</Badge>
          {removable ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${label}`}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-name`}>Full name</Label>
          <Input id={`${id}-name`} value={guest.fullName} onChange={(e) => onChange({ fullName: e.target.value })} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-type`}>Document type</Label>
          <select
            id={`${id}-type`}
            value={guest.documentType}
            onChange={(e) => onChange({ documentType: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-number`}>Document number</Label>
          <Input
            id={`${id}-number`}
            value={guest.documentNumber}
            placeholder={placeholder}
            onChange={(e) => onChange({ documentNumber: e.target.value })}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">ID photo</p>
        <div className="flex flex-wrap items-center gap-3">
          {guest.imageDataUrl ? (
            <button
              type="button"
              onClick={() => onPreview({ src: guest.imageDataUrl, name: label })}
              className="rounded-sm border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Enlarge ${label} ID photo`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={guest.imageDataUrl} alt="" className="h-16 w-24 rounded-sm object-cover" />
            </button>
          ) : (
            <div className="flex h-16 w-24 items-center justify-center rounded-sm border border-dashed text-xs text-muted-foreground">
              No photo
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={`${label} ID photo file`}
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
            {busy ? "Processing" : guest.imageDataUrl ? "Replace photo" : "Upload photo"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Signature</p>
        {showPad ? (
          <SignaturePad
            value={guest.signature}
            savedValue={guest.savedSignature || undefined}
            onChange={(dataUrl) => {
              setDrawing(true);
              onChange({ signature: dataUrl });
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={guest.signature} alt={`${label} signature`} className="h-16 max-w-full rounded-sm border bg-white object-contain" />
            <Button type="button" variant="outline" size="sm" onClick={() => { setDrawing(true); onChange({ signature: "" }); }}>
              Draw again
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

type Props = {
  guests: AdminGuest[];
  booked: number;
  onChange: (key: string, patch: Partial<AdminGuest>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
};

export function GuestEditor({ guests, booked, onChange, onAdd, onRemove }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const completeBooked = guests.slice(0, booked).filter(isGuestComplete).length;
  const extra = Math.max(guests.length - booked, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Guests: {completeBooked} of {booked} booked complete
          {extra > 0 ? ` (+${extra} additional)` : ""}
        </p>
        <Button type="button" variant="outline" size="sm" disabled={guests.length >= MAX_ADMIN_GUESTS} onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
          Add guest
        </Button>
      </div>

      <ul className="space-y-3">
        {guests.map((guest, index) => (
          <GuestCard
            key={guest.key}
            guest={guest}
            index={index}
            removable={index >= booked}
            onChange={(patch) => onChange(guest.key, patch)}
            onRemove={() => onRemove(guest.key)}
            onPreview={setPreview}
          />
        ))}
      </ul>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Identity document</DialogTitle>
            <DialogDescription>{preview?.name}</DialogDescription>
          </DialogHeader>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.src} alt={`${preview.name} identity document`} className="max-h-[70vh] w-full rounded-sm object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
