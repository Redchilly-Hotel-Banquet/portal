"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InvoiceDialog } from "@/components/admin-bookings/invoice-dialog";
import type { BillingSummary } from "@/components/admin-bookings/types";
import { ApiError, apiPost } from "@/lib/apiClient";

/** Opens the guest's own invoice for a booking that has been checked out: the same folio staff print. */
export function InvoiceButton({ bookingId }: { bookingId: string }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [open, setOpen] = useState(false);

  const load = useMutation({
    mutationFn: () => apiPost<BillingSummary>("/me/invoice", { bookingId }, "user"),
    onSuccess: (data) => {
      setSummary(data);
      setOpen(true);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not load your invoice"),
  });

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => (summary ? setOpen(true) : load.mutate())} disabled={load.isPending}>
        {load.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileText className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
        )}
        View invoice
      </Button>
      <InvoiceDialog summary={summary} open={open} onOpenChange={setOpen} />
    </>
  );
}
