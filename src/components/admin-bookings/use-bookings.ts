"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/apiClient";
import type {
  BillingSummary,
  BookingResponse,
  BookingsResponse,
  OutletOption,
} from "./types";
import { errorMessage } from "./utils";

export const BOOKINGS_KEY = ["admin-bookings"] as const;
const billingKey = (id: string) => ["admin-booking-billing", id] as const;

export function useBookingsQuery() {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: () => apiPost<BookingsResponse>("/admin/bookings/manage", { action: "list" }, true),
    refetchInterval: 10_000,
  });
}

export function useOutletsQuery() {
  return useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiGet<{ outlets: OutletOption[] }>("/public/outlets"),
    select: (data) => (Array.isArray(data?.outlets) ? data.outlets : []),
  });
}

export function useBillingQuery(bookingId: string | null) {
  return useQuery({
    queryKey: billingKey(bookingId ?? ""),
    queryFn: () => apiPost<BillingSummary>("/admin/bookings/billing", { bookingId }, true),
    enabled: Boolean(bookingId),
    staleTime: 0,
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPost<BookingResponse>("/admin/bookings/manage", { action: "update_status", id, status }, true),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      queryClient.invalidateQueries({ queryKey: billingKey(vars.id) });
      toast.success("Booking status updated");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to update status")),
  });
}

export function useUpdateAmount(onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, totalAmount }: { id: string; totalAmount: number }) =>
      apiPost<BookingResponse>("/admin/bookings/manage", { action: "update_amount", id, totalAmount }, true),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      queryClient.invalidateQueries({ queryKey: billingKey(vars.id) });
      toast.success("Room charges updated");
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to update booking amount")),
  });
}

export function useCreateBooking(onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<BookingResponse>("/public/bookings", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success("Reservation recorded");
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to create booking")),
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiPost<BillingSummary>("/admin/bookings/billing", { bookingId, action: "checkout" }, true),
    onSuccess: (data, bookingId) => {
      queryClient.setQueryData(billingKey(bookingId), data);
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success("Checked out and folio finalised");
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to complete checkout")),
  });
}
