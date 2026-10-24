"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Branch } from "./types";

type FormState = {
  location_key: string;
  name: string;
  address: string;
  contact_number: string;
  contact_email: string;
  google_maps_url: string;
  sort_order: string;
  is_active: boolean;
};

type Errors = Partial<Record<"location_key" | "contact_email" | "google_maps_url" | "sort_order", string>>;

const blank: FormState = {
  location_key: "",
  name: "",
  address: "",
  contact_number: "",
  contact_email: "",
  google_maps_url: "",
  sort_order: "",
  is_active: true,
};

const fromBranch = (b: Branch): FormState => ({
  location_key: b.location_key,
  name: b.name,
  address: b.address,
  contact_number: b.contact_number,
  contact_email: b.contact_email,
  google_maps_url: b.google_maps_url,
  sort_order: b.sort_order !== null ? String(b.sort_order) : "",
  is_active: b.is_active,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: Branch | null;
  existingKeys: string[];
  saving: boolean;
  onSubmit: (data: Record<string, unknown>, id?: string) => void;
};

export function BranchFormSheet({ open, onOpenChange, branch, existingKeys, saving, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(branch ? fromBranch(branch) : blank);
  }, [open, branch]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const key = form.location_key.trim();
    if (!branch) {
      if (!key) next.location_key = "Enter a location key.";
      else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key)) next.location_key = "Use letters, numbers, hyphens and underscores only.";
      else if (existingKeys.some((k) => k.toLowerCase() === key.toLowerCase())) next.location_key = "A branch with this key already exists.";
    }
    const email = form.contact_email.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) next.contact_email = "Enter a valid email address.";
    const map = form.google_maps_url.trim();
    if (map && !/^https?:\/\//i.test(map)) next.google_maps_url = "Enter a full link starting with https://.";
    if (form.sort_order.trim() && !Number.isFinite(Number(form.sort_order))) next.sort_order = "Enter a number.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const data: Record<string, unknown> = {
      name: form.name.trim(),
      address: form.address.trim(),
      contact_number: form.contact_number.trim(),
      contact_email: email,
      google_maps_url: map,
      is_active: form.is_active,
    };
    if (form.sort_order.trim()) data.sort_order = Number(form.sort_order);
    // The key is fixed once a branch exists; the API only accepts it on create.
    if (!branch) data.location_key = key;
    onSubmit(data, branch?.id);
  };

  const err = (id: string, msg?: string) =>
    msg ? (
      <p id={`${id}-error`} className="text-xs text-destructive">
        {msg}
      </p>
    ) : null;

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <p className="eyebrow">{branch ? "Edit" : "New"}</p>
          <SheetTitle>{branch ? branch.name || branch.location_key : "Add branch"}</SheetTitle>
          <SheetDescription>The location key links rooms, menus, bookings and reports to this branch.</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="branch-key">Location key</Label>
              <Input
                id="branch-key"
                value={form.location_key}
                onChange={(e) => set("location_key", e.target.value)}
                placeholder="redchilly-gorakhpur"
                readOnly={!!branch}
                disabled={saving}
                aria-invalid={!!errors.location_key}
                aria-describedby={errors.location_key ? "branch-key-error" : "branch-key-hint"}
                className={branch ? "bg-muted" : undefined}
              />
              {err("branch-key", errors.location_key)}
              <p id="branch-key-hint" className="text-xs text-muted-foreground">
                {branch ? "Cannot be changed after the branch is created." : "Used in QR links and bookings. Cannot be changed later."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Display name</Label>
              <Input id="branch-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Red Chilly, Gorakhpur" disabled={saving} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-address">Address</Label>
              <Textarea id="branch-address" rows={3} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, area, city, PIN" disabled={saving} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="branch-phone">Phone</Label>
                <Input id="branch-phone" type="tel" value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} placeholder="+91 98765 43210" disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch-email">Email</Label>
                <Input
                  id="branch-email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => set("contact_email", e.target.value)}
                  aria-invalid={!!errors.contact_email}
                  aria-describedby={errors.contact_email ? "branch-email-error" : undefined}
                  disabled={saving}
                />
                {err("branch-email", errors.contact_email)}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
              <div className="space-y-1.5">
                <Label htmlFor="branch-map">Google Maps link</Label>
                <Input
                  id="branch-map"
                  type="url"
                  value={form.google_maps_url}
                  onChange={(e) => set("google_maps_url", e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  aria-invalid={!!errors.google_maps_url}
                  aria-describedby={errors.google_maps_url ? "branch-map-error" : undefined}
                  disabled={saving}
                />
                {err("branch-map", errors.google_maps_url)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch-order">Order</Label>
                <Input
                  id="branch-order"
                  type="number"
                  inputMode="numeric"
                  value={form.sort_order}
                  onChange={(e) => set("sort_order", e.target.value)}
                  placeholder="0"
                  className="tabular-nums"
                  aria-invalid={!!errors.sort_order}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
              <div>
                <Label htmlFor="branch-active" className="text-sm">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">Inactive branches are hidden from guests.</p>
              </div>
              <Switch id="branch-active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} disabled={saving} />
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              {saving ? "Saving" : branch ? "Save changes" : "Add branch"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
