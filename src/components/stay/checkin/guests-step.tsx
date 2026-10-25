"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CircleCheck, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, fieldDescribedBy } from "../field";
import { compressImage } from "../compress-image";
import { DOCUMENT_TYPES, type GuestEntry } from "./types";
import type { CheckinErrors } from "./use-checkin-form";

interface GuestsStepProps {
  guests: GuestEntry[];
  errors: CheckinErrors;
  extraGuests: number;
  onUpdate: (key: string, patch: Partial<GuestEntry>) => void;
}

const SignaturePad = dynamic(() => import("./signature-pad"), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full sm:h-56" />,
});

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

function GuestCard({
  guest,
  index,
  total,
  errors,
  onUpdate,
}: {
  guest: GuestEntry;
  index: number;
  total: number;
  errors: CheckinErrors;
  onUpdate: (patch: Partial<GuestEntry>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const config = DOCUMENT_TYPES.find((d) => d.value === guest.documentType) ?? DOCUMENT_TYPES[0];
  const nameErr = errors[`${guest.key}.name`];
  const numErr = errors[`${guest.key}.number`];
  const phoneErr = errors[`${guest.key}.phone`];
  const sigErr = errors[`${guest.key}.signature`];
  const imgErr = errors[`${guest.key}.image`];
  const id = guest.key;

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("That photo is larger than 15MB. Please choose a smaller image.");
      return;
    }
    setProcessing(true);
    try {
      const image = await compressImage(file);
      onUpdate({ imageDataUrl: image.dataUrl, imageName: image.name, imageType: image.type });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to process the selected file.");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <fieldset className="border border-border bg-card p-4 sm:p-5">
      <legend className="px-2 text-sm font-medium">
        Guest {index + 1} of {total}
      </legend>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id={`${id}-name`} label="Full name" required error={nameErr} className="sm:col-span-3">
          <Input
            id={`${id}-name`}
            autoComplete="name"
            value={guest.fullName}
            onChange={(e) => onUpdate({ fullName: e.target.value })}
            aria-invalid={!!nameErr}
            aria-describedby={fieldDescribedBy(`${id}-name`, !!nameErr, false)}
          />
        </Field>
        <Field
          id={`${id}-phone`}
          label="Mobile number"
          optional
          hint={index === 0 ? "Optional. We send your room and Wi-Fi details here." : "Optional. We can send this guest the room and Wi-Fi details."}
          error={phoneErr}
          className="sm:col-span-3"
        >
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete={index === 0 ? "tel" : "off"}
            placeholder="10-digit mobile number"
            value={guest.phone}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            aria-invalid={!!phoneErr}
            aria-describedby={fieldDescribedBy(`${id}-phone`, !!phoneErr, true)}
          />
        </Field>
        <Field id={`${id}-type`} label="Document" required className="sm:col-span-1">
          <Select value={guest.documentType} onValueChange={(documentType) => onUpdate({ documentType })}>
            <SelectTrigger id={`${id}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-number`} label="Document number" required error={numErr} className="sm:col-span-2">
          <Input
            id={`${id}-number`}
            autoComplete="off"
            placeholder={config.placeholder}
            value={guest.documentNumber}
            onChange={(e) => onUpdate({ documentNumber: e.target.value })}
            aria-invalid={!!numErr}
            aria-describedby={fieldDescribedBy(`${id}-number`, !!numErr, false)}
          />
        </Field>

        <div className="space-y-1.5 sm:col-span-3">
          <p className="text-sm font-medium">
            Photo of document <span aria-hidden="true" className="text-primary">*</span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {guest.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
              <img
                src={guest.imageDataUrl}
                alt={`Identity document for guest ${index + 1}`}
                className="h-20 w-28 border border-border object-cover"
              />
            ) : (
              <div className="flex h-20 w-28 items-center justify-center border border-dashed border-border text-muted-foreground">
                <ImagePlus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
            )}
            <div className="space-y-1">
              <input
                ref={fileRef}
                id={`${id}-file`}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
                aria-describedby={imgErr ? `${id}-file-error` : `${id}-file-hint`}
              />
              <Button type="button" variant="outline" size="sm" disabled={processing} onClick={() => fileRef.current?.click()}>
                {processing ? "Processing" : guest.imageDataUrl ? "Replace photo" : "Add photo"}
              </Button>
              <p id={`${id}-file-hint`} className="text-xs text-muted-foreground">
                JPG or PNG. Make sure the details are readable.
              </p>
            </div>
          </div>
          {imgErr && (
            <p id={`${id}-file-error`} role="alert" className="text-xs font-medium text-destructive">
              {imgErr}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Signature <span aria-hidden="true" className="text-primary">*</span>
            </p>
            {guest.signature && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Signed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {total > 1 ? "Pass the device to this guest to sign. " : ""}Sign with a finger or stylus.
          </p>
          <SignaturePad value={guest.signature || null} onChange={(value) => onUpdate({ signature: value ?? "" })} />
          {sigErr && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {sigErr}
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

export function GuestsStep({ guests, errors, extraGuests, onUpdate }: GuestsStepProps) {
  return (
    <div className="space-y-5">
      {guests.map((guest, index) => (
        <GuestCard
          key={guest.key}
          guest={guest}
          index={index}
          total={guests.length}
          errors={errors}
          onUpdate={(patch) => onUpdate(guest.key, patch)}
        />
      ))}
      {extraGuests > 0 && (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          {extraGuests} additional guest{extraGuests === 1 ? " was" : "s were"} added by reception and will be kept.
        </p>
      )}
    </div>
  );
}
