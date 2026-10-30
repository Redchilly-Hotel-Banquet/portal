"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/apiClient";
import type {
  BillingSummary,
  BookingResponse,
  BookingsResponse,
  ExtensionOptions,
  OutletOption,
} from "./types";
import type { PaymentLine } from "@/lib/payment-modes";
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

export function useCreateBooking(onDone?: (data: BookingResponse | undefined) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<BookingResponse>("/public/bookings", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success("Reservation recorded");
      onDone?.(data);
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to create booking")),
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, payments }: { bookingId: string; payments: PaymentLine[] }) =>
      apiPost<BillingSummary>("/admin/bookings/billing", { bookingId, action: "checkout", payments }, true),
    onSuccess: (data, { bookingId }) => {
      queryClient.setQueryData(billingKey(bookingId), data);
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success("Checked out and folio finalised");
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to complete checkout")),
  });
}

export function useExtensionOptions(bookingId: string | null, newCheckOut: string | null) {
  return useQuery({
    queryKey: ["extension-options", bookingId, newCheckOut],
    queryFn: () => apiPost<ExtensionOptions>("/admin/bookings/manage", { action: "extension_options", id: bookingId, newCheckOut }, true),
    enabled: Boolean(bookingId && newCheckOut),
    staleTime: 0,
    retry: false,
  });
}

function useStayChange<TVars>(request: (vars: TVars) => Record<string, unknown>, success: string, onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => apiPost<BookingResponse>("/admin/bookings/manage", request(vars), true),
    onSuccess: async (_data, vars) => {
      const id = (request(vars) as { id?: string }).id;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY }),
        queryClient.invalidateQueries({ queryKey: id ? billingKey(id) : ["admin-booking-billing"] }),
      ]);
      toast.success(success);
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to update the stay")),
  });
}

export const useExtendStay = (onDone?: () => void) =>
  useStayChange(
    (vars: { id: string; newCheckOut: string; rooms: Array<{ id: string; rate?: number }> }) => ({ action: "extend_stay", ...vars }),
    "Stay extended",
    onDone,
  );

export const useUpdateStayRate = (onDone?: () => void) =>
  useStayChange(
    (vars: { id: string; segmentIndex: number; rate: number }) => ({ action: "update_stay_rate", ...vars }),
    "Room rate updated",
    onDone,
  );

export const useSplitStayLines = (onDone?: () => void) =>
  useStayChange((vars: { id: string }) => ({ action: "split_stay_lines", ...vars }), "Room lines created", onDone);
