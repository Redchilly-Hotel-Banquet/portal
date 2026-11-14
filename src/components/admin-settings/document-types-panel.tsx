"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOutlets } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";
import { MAX_DOCUMENT_TYPES, MAX_PHOTOS_PER_DOCUMENT, documentTypesError, normaliseDocumentTypes, type DocumentTypeConfig } from "@/lib/document-types";

const KEY = ["document-types", "admin"];

/** Which identity documents guests can give at check-in, and how many photos each one needs. */
export function DocumentTypesPanel() {
  const queryClient = useQueryClient();
  const canEdit = getAdminOutlets().includes("all");
  const [types, setTypes] = useState<DocumentTypeConfig[]>([]);

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiPost<{ document_types?: unknown }>("/admin/config", { action: "get" }, true),
    select: (data) => normaliseDocumentTypes(data?.document_types),
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.data) setTypes(query.data.map((t) => ({ ...t, photos: [...t.photos], optional: [...t.optional] })));
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiPost("/admin/config", { action: "update_document_types", document_types: types }, true),
    onSuccess: () => {
      toast.success("Document types saved");
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["document-types"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the document types"),
  });

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Document types could not be loaded.</p>;

  const change = (index: number, patch: Partial<DocumentTypeConfig>) => setTypes((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  // A type added in this session has no stored records yet, so its stored name follows what is typed.
  const isNew = (type: DocumentTypeConfig) => !(query.data ?? []).some((t) => t.value === type.value);
  const problem = documentTypesError(types);
  const dirty = JSON.stringify(types) !== JSON.stringify(query.data);

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem) return toast.error(problem);
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-lg">Identity documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The documents a guest can give at check-in, and the photos each one needs: for example a card has a front and a back, a passport one photo page. Reception and the guest check-in form both follow this list.
        </p>
      </div>

      {types.map((type, index) => (
        <section key={type.value + index} className="space-y-4 rounded-md border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`doc-name-${index}`} className="text-sm font-medium">Name</label>
                <Input id={`doc-name-${index}`} value={type.label} disabled={!canEdit} onChange={(e) => change(index, isNew(type) ? { label: e.target.value, value: e.target.value } : { label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`doc-hint-${index}`} className="text-sm font-medium">Number hint</label>
                <Input id={`doc-hint-${index}`} value={type.placeholder} disabled={!canEdit} onChange={(e) => change(index, { placeholder: e.target.value })} placeholder="12-digit Aadhaar number" />
              </div>
            </div>
            {canEdit ? (
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${type.label}`} onClick={() => setTypes((prev) => prev.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Photos to upload ({type.photos.length}{type.optional.some(Boolean) ? `, ${type.optional.filter(Boolean).length} optional` : ""})</p>
            <ul className="space-y-2">
              {type.photos.map((photo, photoIndex) => (
                <li key={photoIndex} className="flex items-center gap-2">
                  <span className="w-6 text-sm tabular-nums text-muted-foreground">{photoIndex + 1}.</span>
                  <Input aria-label={`${type.label} photo ${photoIndex + 1} name`} value={photo} disabled={!canEdit} onChange={(e) => change(index, { photos: type.photos.map((p, i) => (i === photoIndex ? e.target.value : p)) })} placeholder="Front" />
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <Switch
                      checked={type.optional[photoIndex] === true}
                      disabled={!canEdit}
                      aria-label={`${type.label} ${photo || `photo ${photoIndex + 1}`} is optional`}
                      onCheckedChange={(value) => change(index, { optional: type.photos.map((_, i) => (i === photoIndex ? value : type.optional[i] === true)) })}
                    />
                    <span className="w-14 text-xs text-muted-foreground">{type.optional[photoIndex] ? "Optional" : "Required"}</span>
                  </label>
                  {canEdit && type.photos.length > 1 ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove photo ${photoIndex + 1}`} onClick={() => change(index, { photos: type.photos.filter((_, i) => i !== photoIndex), optional: type.optional.filter((_, i) => i !== photoIndex) })}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit && type.photos.length < MAX_PHOTOS_PER_DOCUMENT ? (
              <Button type="button" variant="outline" size="sm" onClick={() => change(index, { photos: [...type.photos, type.photos.length === 1 ? "Back" : "Photo"], optional: [...type.optional, false] })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Add a photo
              </Button>
            ) : null}
          </div>
        </section>
      ))}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          {types.length < MAX_DOCUMENT_TYPES ? (
            <Button type="button" variant="outline" onClick={() => setTypes((prev) => [...prev, { value: `Document ${prev.length + 1}`, label: `Document ${prev.length + 1}`, placeholder: "Document number", photos: ["Front"], optional: [false] }])}>
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Add a document type
            </Button>
          ) : null}
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Save document types
          </Button>
          {problem && dirty ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">Only an all-branch administrator can change the document types.</p>}
    </form>
  );
}
