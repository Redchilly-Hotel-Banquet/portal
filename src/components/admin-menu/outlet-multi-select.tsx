"use client";

import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  outlets: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Outlets that cannot be picked, with the reason shown beside them. */
  disabled?: Record<string, string>;
  loading?: boolean;
};

export function OutletMultiSelect({ outlets, selected, onChange, disabled = {}, loading }: Props) {
  const pickable = outlets.filter((o) => !disabled[o]);
  const allSelected = pickable.length > 0 && pickable.every((o) => selected.includes(o));

  const toggle = (outlet: string, checked: boolean) =>
    onChange(checked ? Array.from(new Set([...selected, outlet])) : selected.filter((o) => o !== outlet));

  if (loading) return <p className="text-sm text-muted-foreground">Loading</p>;
  if (outlets.length === 0) return <p className="text-sm text-muted-foreground">No outlets</p>;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={allSelected} onCheckedChange={(c) => onChange(c === true ? pickable : [])} />
        All branches
      </label>
      <div className="grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
        {outlets.map((outlet) => (
          <label key={outlet} className={`flex items-center gap-2 text-sm ${disabled[outlet] ? "opacity-50" : ""}`}>
            <Checkbox
              checked={selected.includes(outlet)}
              disabled={Boolean(disabled[outlet])}
              onCheckedChange={(c) => toggle(outlet, c === true)}
            />
            <span>{outlet}</span>
            {disabled[outlet] ? <span className="text-xs text-muted-foreground">({disabled[outlet]})</span> : null}
          </label>
        ))}
      </div>
    </div>
  );
}
