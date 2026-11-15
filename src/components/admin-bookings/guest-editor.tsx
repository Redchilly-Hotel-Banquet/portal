"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { DocumentPhotos } from "@/components/stay/checkin/document-photos";
import { useDocumentTypes } from "@/hooks/useDocumentTypes";
import { photoSpecsFor } from "@/lib/document-types";
import { sideImage, withSideImage } from "@/lib/document-photos";
import { ageError, guestStatus, isGuestComplete, MAX_ADMIN_GUESTS, type AdminGuest, type Completeness } from "./checkin-guests";
import { SignaturePad } from "./signature-pad";
import { optionalPhoneError } from "@/lib/phone";
import { DEFAULT_CHECKIN_RULES, type CheckinRules } from "@/lib/checkin-rules";

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
  rules: CheckinRules;
};

function GuestCard({ guest, index, removable, onChange, onRemove, onPreview, rules }: CardProps) {
  const [drawing, setDrawing] = useState(false);
  const status = guestStatus(guest, rules);
  const id = `guest-${guest.key}`;
  const types = useDocumentTypes();
  const sides = photoSpecsFor(types, guest.documentType);
  const placeholder = types.find((type) => type.value === guest.documentType)?.placeholder ?? "Document number";
  const label = guest.fullName.trim() || `Guest ${index + 1}`;
  const showPad = drawing || !guest.signature;

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
          <Label htmlFor={`${id}-age`}>
            Age <span className="text-xs font-normal text-muted-foreground">Optional</span>
          </Label>
          <Input id={`${id}-age`} inputMode="numeric" value={guest.age} onChange={(e) => onChange({ age: e.target.value.replace(/\D/g, "").slice(0, 3) })} autoComplete="off" />
          {ageError(guest.age) ? <p className="text-xs text-destructive">{ageError(guest.age)}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-nationality`}>
            Nationality <span className="text-xs font-normal text-muted-foreground">Optional</span>
          </Label>
          <Input id={`${id}-nationality`} value={guest.nationality} placeholder="Indian" onChange={(e) => onChange({ nationality: e.target.value })} autoComplete="off" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-address`}>
            Permanent address <span className="text-xs font-normal text-muted-foreground">Optional</span>
          </Label>
          <Textarea id={`${id}-address`} rows={2} maxLength={300} value={guest.permanentAddress} onChange={(e) => onChange({ permanentAddress: e.target.value })} autoComplete="off" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-phone`}>
            Mobile number <span className="text-xs font-normal text-muted-foreground">Optional</span>
          </Label>
          <PhoneInput id={`${id}-phone`} invalid={Boolean(optionalPhoneError(guest.phone))} value={guest.phone} onChange={(v) => onChange({ phone: v })} />
          {optionalPhoneError(guest.phone) ? <p className="text-xs text-destructive">{optionalPhoneError(guest.phone)}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-type`}>Document type</Label>
          <select
            id={`${id}-type`}
            value={guest.documentType}
            onChange={(e) => onChange({ documentType: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          >
            {(types.some((type) => type.value === guest.documentType) ? types : [...types, { value: guest.documentType, label: guest.documentType, placeholder: "", photos: ["Photo"], optional: [false] }]).map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-number`}>Document number{rules.document_number ? "" : " (optional)"}</Label>
          <Input
            id={`${id}-number`}
            value={guest.documentNumber}
            placeholder={placeholder}
            onChange={(e) => onChange({ documentNumber: e.target.value })}
            autoComplete="off"
          />
        </div>
      </div>

      <DocumentPhotos
        id={id}
        who={label}
        sides={sides}
        images={sides.map((_, index) => sideImage(guest, index))}
        optional={!rules.document_photo}
        onChange={(index, image) => onChange(withSideImage(guest, index, image))}
        onPreview={onPreview}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Signature{rules.signature ? "" : " (optional)"}</p>
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
  rules?: CheckinRules;
};

export function GuestEditor({ guests, booked, onChange, onAdd, onRemove, rules = DEFAULT_CHECKIN_RULES }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const completeBooked = guests.slice(0, booked).filter((guest) => isGuestComplete(guest, rules)).length;
  const extra = Math.max(guests.length - booked, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {guests.length} guest{guests.length === 1 ? "" : "s"} arriving, {guests.filter((guest) => isGuestComplete(guest, rules)).length} complete
          {guests.length !== booked ? ` (${booked} booked)` : ""}
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
            removable={guests.length > 1}
            onChange={(patch) => onChange(guest.key, patch)}
            onRemove={() => onRemove(guest.key)}
            onPreview={setPreview}
            rules={rules}
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
