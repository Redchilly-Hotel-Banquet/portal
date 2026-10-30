"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type BranchOption = { id: string; name: string };

type Props = {
  options: BranchOption[];
  /** Chosen branch ids; empty means every branch. */
  selected: string[];
  onChange: (next: string[]) => void;
};

export function BranchFilter({ options, selected, onChange }: Props) {
  const all = selected.length === 0 || selected.length === options.length;
  const label = all ? "All branches" : selected.length === 1 ? (options.find((o) => o.id === selected[0])?.name ?? "1 branch") : `${selected.length} branches`;

  const toggle = (id: string, checked: boolean) => {
    const base = all ? options.map((o) => o.id) : selected;
    const next = checked ? Array.from(new Set([...base, id])) : base.filter((value) => value !== id);
    // Nothing ticked would be an empty page; fall back to every branch.
    onChange(next.length === options.length ? [] : next.length === 0 ? [] : next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[180px] justify-between" aria-label="Filter by branch">
          {label}
          <ChevronDown className="ml-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={all} onCheckedChange={() => onChange([])} />
          All branches
        </label>
        <div className="space-y-2 border-t border-border pt-2">
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={all || selected.includes(option.id)} onCheckedChange={(c) => toggle(option.id, c === true)} />
              {option.name}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
