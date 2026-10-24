"use client";

import { useQuery } from "@tanstack/react-query";
import { apiPost } from "@/lib/apiClient";

type OutletsResponse = { outlet?: Array<{ id?: string; location_key?: string }> | null };

/** Active outlet keys, from the same public endpoint the old console used. */
export function useOutletKeys() {
  const query = useQuery({
    queryKey: ["validated-location"],
    queryFn: () => apiPost<OutletsResponse>("/public/locations/validate", {}),
    staleTime: 5 * 60_000,
  });
  const keys = (query.data?.outlet ?? [])
    .map((o) => o.location_key)
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  return { keys, isLoading: query.isLoading };
}
