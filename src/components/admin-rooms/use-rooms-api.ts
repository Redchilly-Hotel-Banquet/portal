"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/apiClient";
import { getAdminOutlets, hasOutletAccess } from "@/hooks/useAdminAccess";
import {
  toPricingRule,
  toRoomRecord,
  type OutletRef,
  type PricingRule,
  type PricingRulePayload,
  type RoomPayload,
  type RoomRecord,
} from "./types";
import { errorMessage } from "./utils";

export const ROOMS_KEY = ["admin-rooms"];
const OUTLETS_KEY = ["validated-location"];
const PRICING_KEY = ["room-pricing-rules"];

type Raw = Record<string, unknown>;

export function useRooms() {
  return useQuery<RoomRecord[], Error>({
    queryKey: ROOMS_KEY,
    queryFn: async () => {
      const res = await apiPost<{ rooms?: Raw[] } | Raw[]>("/admin/rooms/manage", { action: "list" }, true);
      const list = Array.isArray(res) ? res : res?.rooms ?? [];
      return list.map(toRoomRecord).filter((r): r is RoomRecord => r !== null);
    },
  });
}

/** Active outlets known to the guest flow, limited to those the signed-in user may manage. */
export function useOutlets(rooms: RoomRecord[]) {
  const query = useQuery<OutletRef[], Error>({
    queryKey: OUTLETS_KEY,
    queryFn: async () => {
      const res = await apiPost<{ outlet?: Array<{ id?: string; _id?: string; location_key?: string | null }> }>(
        "/public/locations/validate",
        {},
      );
      return (res?.outlet ?? [])
        .filter((o) => typeof o.location_key === "string" && o.location_key)
        .map((o) => ({ id: String(o.id ?? o._id ?? ""), location_key: o.location_key as string }));
    },
    staleTime: 60_000,
  });

  const outlets = query.data;
  const keys = useMemo(() => {
    const set = new Set<string>((outlets ?? []).map((o) => o.location_key));
    rooms.forEach((r) => r.outlet_id && set.add(r.outlet_id));
    const allowed = getAdminOutlets();
    return Array.from(set)
      .filter((key) => hasOutletAccess(allowed, key))
      .sort((a, b) => a.localeCompare(b));
  }, [outlets, rooms]);

  return { refs: outlets ?? [], keys, isLoading: query.isLoading, isError: query.isError };
}

export function useRoomMutations(onSaved: () => void) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: RoomPayload }) =>
      apiPost("/admin/rooms/manage", id ? { action: "update", id, data } : { action: "create", data }, true),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
      toast.success(vars.id ? "Changes saved." : "Added to inventory.");
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not save. Please try again.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiPost("/admin/rooms/manage", { action: "delete", id }, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
      toast.success("Removed from inventory.");
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete. Please try again.")),
  });

  return { save, remove };
}

export function usePricingRules() {
  return useQuery<PricingRule[], Error>({
    queryKey: PRICING_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiPost<{ rules?: Raw[] }>("/admin/rooms/pricing", { action: "list" }, true);
      return (res?.rules ?? [])
        .map(toPricingRule)
        .filter((r): r is PricingRule => r !== null)
        .sort((a, b) => new Date(a.start_date ?? 0).getTime() - new Date(b.start_date ?? 0).getTime());
    },
  });
}

export function usePricingMutations(onCreated: () => void) {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (rule: PricingRulePayload) => apiPost("/admin/rooms/pricing", { action: "create", rule }, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_KEY });
      toast.success("Pricing rule added.");
      onCreated();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not save the pricing rule.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiPost("/admin/rooms/pricing", { action: "delete", id }, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_KEY });
      toast.success("Pricing rule removed.");
    },
    onError: (err) => toast.error(errorMessage(err, "Could not remove the pricing rule.")),
  });

  return { create, remove };
}
