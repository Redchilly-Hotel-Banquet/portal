"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OutletMultiSelect } from "./outlet-multi-select";
import { compressImage } from "./image";
import { categoryId, type CategoryRecord, type MenuItemPayload, type MenuItemRecord } from "./types";

type FormState = {
  name: string;
  description: string;
  price: string;
  /** Id of the selected category record; the outlet follows from it. */
  category: string;
  outlet_id: string;
  prep_time_minutes: string;
  is_veg: boolean;
  is_available: boolean;
  image_url: string;
};

const blank = (outlet: string): FormState => ({
  name: "",
  description: "",
  price: "",
  category: "",
  outlet_id: outlet,
  prep_time_minutes: "15",
  is_veg: true,
  is_available: true,
  image_url: "",
});

/** Items saved before categories were linked by id carry only a name, so match on name + outlet. */
const categoryForItem = (item: MenuItemRecord, categories: CategoryRecord[]): string => {
  const byId = item.category_id && categories.find((c) => categoryId(c) === item.category_id);
  if (byId) return categoryId(byId);
  const name = (item.category ?? item.category_id ?? "").trim().toLowerCase();
  const byName = categories.find(
    (c) => c.name.trim().toLowerCase() === name && (!item.outlet_id || c.outlet_id === item.outlet_id),
  );
  return byName ? categoryId(byName) : "";
};

const fromItem = (item: MenuItemRecord, categories: CategoryRecord[]): FormState => ({
  name: item.name ?? "",
  description: item.description ?? "",
  price: String(item.price ?? item.base_price ?? ""),
  category: categoryForItem(item, categories),
  outlet_id: item.outlet_id ?? "",
  prep_time_minutes: String(item.prep_time_minutes ?? 15),
  is_veg: Boolean(item.is_veg),
  is_available: Boolean(item.is_available),
  image_url: item.image_url ?? "",
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuItemRecord | null;
  categories: CategoryRecord[];
  categoriesLoading: boolean;
  outlets: string[];
  defaultOutlet: string;
  saving: boolean;
  /** One payload per branch when creating; exactly one when editing. */
  onSubmit: (payloads: MenuItemPayload[]) => void;
};

export function MenuItemSheet({
  open,
  onOpenChange,
  item,
  categories,
  categoriesLoading,
  outlets,
  defaultOutlet,
  saving,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(() => blank(defaultOutlet));
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(item ? fromItem(item, categories) : blank(defaultOutlet));
    // Reset only when the sheet opens or targets another item, not when the category list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, defaultOutlet]);

  // Every branch is ticked by default, including ones that finish loading after the sheet opens.
  const outletsKey = outlets.join("|");
  useEffect(() => {
    if (open) setSelectedOutlets(outlets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, outletsKey]);

  // Same category name can exist per outlet, so list them as "Category (outlet)".
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c.is_active !== false || categoryId(c) === form.category)
        .map((c) => ({ id: categoryId(c), name: c.name, outlet: c.outlet_id ?? "" }))
        .filter((c) => c.id)
        .sort((a, b) => a.name.localeCompare(b.name) || a.outlet.localeCompare(b.outlet)),
    [categories, form.category],
  );
  const selected = categoryOptions.find((c) => c.id === form.category);
  // Choosing a category decides the outlet. Only a category with no outlet leaves it to pick.
  const outletFromCategory = selected?.outlet ?? "";

  const chooseCategory = (id: string) => {
    const next = categoryOptions.find((c) => c.id === id);
    setForm((f) => ({ ...f, category: id, outlet_id: next?.outlet || (outlets.includes(f.outlet_id) ? f.outlet_id : "") }));
  };

  // When adding, the category is chosen by name and each branch uses its own category of that name.
  const creating = !item;
  const nameOptions = useMemo(
    () => Array.from(new Set(categoryOptions.map((c) => c.name))).sort((a, b) => a.localeCompare(b)),
    [categoryOptions],
  );
  const categoryByOutlet = (outlet: string) =>
    categoryOptions.find((c) => c.name === form.category && c.outlet === outlet);
  const missing = useMemo(() => {
    if (!form.category) return {};
    return Object.fromEntries(
      outlets.filter((o) => !categoryOptions.some((c) => c.name === form.category && c.outlet === o)).map((o) => [o, "no such category"]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category, outlets, categoryOptions]);

  const chooseCategoryName = (categoryName: string) => {
    setForm((f) => ({ ...f, category: categoryName }));
    setSelectedOutlets(outlets.filter((o) => categoryOptions.some((c) => c.name === categoryName && c.outlet === o)));
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      set("image_url", await compressImage(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process the image.");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price.");
      return;
    }
    if (!form.category) {
      toast.error("Select a category.");
      return;
    }
    const shared = {
      name: form.name.trim(),
      description: form.description.trim(),
      base_price: price,
      prep_time_minutes: parseInt(form.prep_time_minutes || "0", 10) || 0,
      is_veg: form.is_veg,
      is_available: form.is_available,
      image_url: form.image_url.trim(),
    };
    if (creating) {
      if (selectedOutlets.length === 0) {
        toast.error("Select at least one branch.");
        return;
      }
      onSubmit(
        selectedOutlets.map((outlet) => {
          const category = categoryByOutlet(outlet);
          return { ...shared, category_id: category?.id ?? "", category: form.category, outlet_id: outlet };
        }),
      );
      return;
    }
    if (!form.outlet_id) {
      toast.error("Select an outlet.");
      return;
    }
    onSubmit([{ ...shared, category_id: form.category, category: selected?.name ?? "", outlet_id: form.outlet_id }]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <p className="eyebrow">Menu</p>
          <SheetTitle className="font-display text-2xl">{item ? "Edit menu item" : "New menu item"}</SheetTitle>
          <SheetDescription>Guests see available items for the selected outlet.</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="mi-name">Name</Label>
            <Input id="mi-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mi-desc">Description</Label>
            <Textarea id="mi-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mi-price">Price (INR)</Label>
              <Input id="mi-price" type="number" inputMode="decimal" min="0" step="0.01" className="tabular-nums" value={form.price} onChange={(e) => set("price", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-prep">Prep time (min)</Label>
              <Input id="mi-prep" type="number" inputMode="numeric" min="0" className="tabular-nums" value={form.prep_time_minutes} onChange={(e) => set("prep_time_minutes", e.target.value)} required />
            </div>
          </div>
          {creating ? (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label id="mi-cat-label">Category</Label>
                <Select value={form.category} onValueChange={chooseCategoryName} disabled={categoriesLoading || nameOptions.length === 0}>
                  <SelectTrigger aria-labelledby="mi-cat-label">
                    <SelectValue placeholder={categoriesLoading ? "Loading" : nameOptions.length === 0 ? "Add a category first" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    {nameOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Branches</Label>
                <OutletMultiSelect outlets={outlets} selected={selectedOutlets} onChange={setSelectedOutlets} disabled={missing} loading={outlets.length === 0} />
                <p className="text-xs text-muted-foreground">The item is added to each selected branch under its own category of that name.</p>
              </div>
            </div>
          ) : (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label id="mi-cat-label">Category</Label>
              <Select value={form.category} onValueChange={chooseCategory} disabled={categoriesLoading || categoryOptions.length === 0}>
                <SelectTrigger aria-labelledby="mi-cat-label">
                  <SelectValue placeholder={categoriesLoading ? "Loading" : categoryOptions.length === 0 ? "Add a category first" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.outlet ? ` (${c.outlet})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label id="mi-outlet-label">Outlet</Label>
              {outletFromCategory || !selected ? (
                <Input
                  aria-labelledby="mi-outlet-label"
                  readOnly
                  tabIndex={-1}
                  value={outletFromCategory}
                  placeholder="Set by the category"
                  className="bg-muted/60 text-muted-foreground"
                />
              ) : (
                <Select value={form.outlet_id} onValueChange={(v) => set("outlet_id", v)} disabled={outlets.length === 0}>
                  <SelectTrigger aria-labelledby="mi-outlet-label">
                    <SelectValue placeholder={outlets.length === 0 ? "No outlets" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="mi-image">Image</Label>
            <div className="flex items-start gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {form.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.image_url} alt="Menu item preview" className="h-full w-full object-cover" onError={() => set("image_url", "")} />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input ref={fileRef} id="mi-image" type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={processing} onClick={() => fileRef.current?.click()}>
                    <Upload aria-hidden strokeWidth={1.75} /> {processing ? "Processing" : "Upload"}
                  </Button>
                  {form.image_url ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => set("image_url", "")}>
                      <X aria-hidden strokeWidth={1.75} /> Remove
                    </Button>
                  ) : null}
                </div>
                <Input
                  aria-label="Image URL"
                  placeholder="or paste an image URL"
                  value={form.image_url.startsWith("data:") ? "" : form.image_url}
                  onChange={(e) => set("image_url", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Uploads are resized to 1280 px and compressed automatically.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="mi-veg">Vegetarian</Label>
              <Switch id="mi-veg" checked={form.is_veg} onCheckedChange={(v) => set("is_veg", v)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="mi-avail">Available to order</Label>
              <Switch id="mi-avail" checked={form.is_available} onCheckedChange={(v) => set("is_available", v)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || processing}>{saving ? "Saving" : item ? "Save changes" : "Create item"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
