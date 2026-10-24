"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Lock, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiPost } from "@/lib/apiClient";
import { compressImage } from "@/components/stay/compress-image";
import { DOCUMENT_TYPES } from "@/components/stay/checkin/types";
import { profileKeys, useSavedDetails } from "./queries";

const SignaturePad = dynamic(() => import("@/components/stay/checkin/signature-pad"), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full" />,
});

const errorOf = (error: unknown) => (error instanceof ApiError ? error.message : "Could not save. Please try again.");

const maskNumber = (value: string) => {
  const compact = value.replace(/\s/g, "");
  return compact.length > 4 ? `${"•".repeat(Math.min(compact.length - 4, 8))} ${compact.slice(-4)}` : "••••";
};

export function SavedDocuments() {
  const queryClient = useQueryClient();
  const { data: saved, isLoading } = useSavedDetails(true);

  const [docType, setDocType] = useState<string>(DOCUMENT_TYPES[0].value);
  const [docNumber, setDocNumber] = useState("");
  const [docImage, setDocImage] = useState("");
  const [changingNumber, setChangingNumber] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Each section re-syncs only when its own saved values change. A background refetch after saving
  // one section must not wipe what the user is typing or drawing in the other.
  useEffect(() => {
    if (!saved) return;
    setDocType(saved.documentType || DOCUMENT_TYPES[0].value);
    setDocNumber(saved.documentNumber);
    setDocImage(saved.documentImageDataUrl);
    setChangingNumber(!saved.documentNumber);
  }, [saved?.documentType, saved?.documentNumber, saved?.documentImageDataUrl]);

  useEffect(() => {
    if (!saved) return;
    setSignature(saved.signatureDataUrl || null);
    setDrawing(false);
  }, [saved?.signatureDataUrl]);

  const store = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/me/details", body, "user"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.details });
      void queryClient.invalidateQueries({ queryKey: profileKeys.profile });
    },
    onError: (error) => toast.error(errorOf(error)),
  });

  const savedSignature = saved?.signatureDataUrl ?? "";
  const hasNumber = Boolean(saved?.documentNumber);
  const meta = DOCUMENT_TYPES.find((d) => d.value === docType) ?? DOCUMENT_TYPES[0];

  const saveId = () =>
    store.mutate(
      {
        documentType: docType,
        documentNumber: docNumber,
        ...(docImage && docImage !== saved?.documentImageDataUrl ? { documentImageDataUrl: docImage } : {}),
      },
      { onSuccess: () => toast.success("ID details saved") },
    );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    try {
      setDocImage((await compressImage(file)).dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process the image.");
    } finally {
      setImageBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <section className="space-y-8 rounded-md border border-border bg-card p-5" aria-labelledby="saved-title">
      <div>
        <p className="eyebrow">Check-in</p>
        <h2 id="saved-title" className="mt-2 text-xl">
          Saved ID and signature
        </h2>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
          Stored encrypted and used only to prefill your online check-in. Remove it whenever you like.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-base">Identity document</h3>
        <div className="space-y-1.5">
          <Label id="doc-type-label">Document type</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger aria-labelledby="doc-type-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-number">Document number</Label>
          {hasNumber && !changingNumber ? (
            <div className="flex gap-2">
              <Input id="doc-number" readOnly value={maskNumber(saved!.documentNumber)} className="bg-muted/60 font-mono" />
              <Button type="button" variant="outline" onClick={() => setChangingNumber(true)}>
                Change
              </Button>
            </div>
          ) : (
            <Input
              id="doc-number"
              autoComplete="off"
              inputMode={docType === "Aadhar Card" ? "numeric" : "text"}
              placeholder={meta.placeholder}
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              className="font-mono"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="doc-photo">Photo of the document</Label>
          <div className="flex items-start gap-4">
            <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
              {docImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={docImage} alt="Saved identity document" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              )}
            </div>
            <div className="space-y-2">
              <input ref={fileRef} id="doc-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button type="button" size="sm" variant="outline" disabled={imageBusy} onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                {imageBusy ? "Processing" : docImage ? "Replace photo" : "Upload photo"}
              </Button>
              <p className="text-xs text-muted-foreground">Resized in your browser before saving.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={saveId} disabled={store.isPending || imageBusy || !docNumber.trim()}>
            {store.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Save ID details
          </Button>
          {hasNumber || saved?.documentImageDataUrl ? (
            <Button
              type="button"
              variant="ghost"
              disabled={store.isPending}
              onClick={() => store.mutate({ clear: ["document"] }, { onSuccess: () => toast.success("ID details removed") })}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-base">Signature</h3>
        {savedSignature && !drawing ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savedSignature} alt="Your saved signature" className="h-24 w-full max-w-xs rounded-md border border-border bg-white object-contain" />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSignature(null);
                  setDrawing(true);
                }}
              >
                Draw again
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={store.isPending}
                onClick={() => store.mutate({ clear: ["signature"] }, { onSuccess: () => toast.success("Signature removed") })}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad value={signature} onChange={setSignature} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={store.isPending || !signature}
                onClick={() =>
                  store.mutate({ signatureDataUrl: signature }, { onSuccess: () => toast.success("Signature saved") })
                }
              >
                {store.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Save signature
              </Button>
              {savedSignature ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSignature(savedSignature);
                    setDrawing(false);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
