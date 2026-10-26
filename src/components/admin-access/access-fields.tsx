"use client";

import { Label } from "@/components/ui/label";

export const ROLE_OPTIONS = [
  { value: "admin", label: "Administrator", hint: "Everything, including prices, access and settings" },
  { value: "rooms", label: "Front desk", hint: "Bookings, check-in and check-out, rooms on or off" },
  { value: "kitchen", label: "Kitchen", hint: "Orders, and dishes on or off" },
] as const;

export type BranchOption = { location_key: string; name: string };

type Props = {
  idPrefix: string;
  roles: string[];
  outlets: string[];
  branches: BranchOption[];
  disabled?: boolean;
  onRoles: (roles: string[]) => void;
  onOutlets: (outlets: string[]) => void;
};

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

/** Roles and branches, the two things that decide what a person can do and where. */
export function AccessFields({ idPrefix, roles, outlets, branches, disabled, onRoles, onOutlets }: Props) {
  const all = outlets.includes("all");
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">Roles</legend>
        {ROLE_OPTIONS.map((role) => (
          <label key={role.value} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={roles.includes(role.value)} onChange={() => onRoles(toggle(roles, role.value))} />
            <span>
              <span className="font-medium">{role.label}</span>
              <span className="block text-xs text-muted-foreground">{role.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled || roles.length === 0}>
        <legend className="text-sm font-medium">Branches</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={all} onChange={() => onOutlets(all ? [] : ["all"])} />
          <span className="font-medium">All branches</span>
        </label>
        {branches.map((branch) => (
          <label key={branch.location_key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              id={`${idPrefix}-${branch.location_key}`}
              checked={all || outlets.includes(branch.location_key)}
              disabled={all}
              onChange={() => onOutlets(toggle(outlets, branch.location_key))}
            />
            <Label htmlFor={`${idPrefix}-${branch.location_key}`} className="font-normal">
              {branch.name}
            </Label>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
