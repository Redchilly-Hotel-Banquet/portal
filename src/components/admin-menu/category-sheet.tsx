"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OutletMultiSelect } from "./outlet-multi-select";
import type { CategoryPayload, CategoryRecord } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRecord | null;
  outlets: string[];
  outletsLoading: boolean;
  nextOrder: number;
  saving: boolean;
  /** One payload per branch when creating; exactly one when editing. */
  onSubmit: (payloads: CategoryPayload[]) => void;
};

export function CategorySheet({ open, onOpenChange, category, outlets, outletsLoading, nextOrder, saving, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [outlet, setOutlet] = useState("");
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);
  const [order, setOrder] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setDescription(category?.description ?? "");
    setOutlet(category?.outlet_id ?? (outlets.length === 1 ? outlets[0] : ""));
    setOrder(String(category?.sort_order ?? nextOrder));
    setActive(category?.is_active ?? true);
  }, [open, category, outlets, nextOrder]);

  const outletsKey = outlets.join("|");
  useEffect(() => {
    if (open) setSelectedOutlets(outlets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, outletsKey]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const targets = category ? [outlet] : selectedOutlets;
    if (targets.length === 0 || targets.some((o) => !o)) {
      toast.error("Select at least one branch.");
      return;
    }
    onSubmit(
      targets.map((outlet_id) => ({
        name: name.trim(),
        description: description.trim(),
        outlet_id,
        sort_order: parseInt(order, 10) || 0,
        is_active: active,
      })),
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <p className="eyebrow">Menu</p>
          <SheetTitle className="font-display text-2xl">{category ? "Edit category" : "New category"}</SheetTitle>
          <SheetDescription>Categories group dishes on the guest menu, in the order set here.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea id="cat-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {category ? (
            <div className="space-y-2">
              <Label id="cat-outlet-label">Outlet</Label>
              <Select value={outlet} onValueChange={setOutlet} disabled={outletsLoading || outlets.length === 0}>
                <SelectTrigger aria-labelledby="cat-outlet-label">
                  <SelectValue placeholder={outletsLoading ? "Loading" : outlets.length === 0 ? "No outlets" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Branches</Label>
              <OutletMultiSelect outlets={outlets} selected={selectedOutlets} onChange={setSelectedOutlets} loading={outletsLoading} />
              <p className="text-xs text-muted-foreground">One category is created for each selected branch.</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="cat-order">Display order</Label>
            <Input id="cat-order" type="number" inputMode="numeric" className="tabular-nums" value={order} onChange={(e) => setOrder(e.target.value)} />
            <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <Label htmlFor="cat-active">Shown to guests</Label>
            <Switch id="cat-active" checked={active} onCheckedChange={setActive} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving" : category ? "Save changes" : "Create category"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
