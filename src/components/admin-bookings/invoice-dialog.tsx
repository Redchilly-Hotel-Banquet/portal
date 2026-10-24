"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceDocument } from "./invoice-document";
import type { BillingSummary } from "./types";

const PRINT_CSS = `
.invoice-print-root { display: none; }
@media print {
  @page { margin: 12mm; }
  body > *:not(.invoice-print-root) { display: none !important; }
  .invoice-print-root { display: block !important; }
  .invoice-print-root .invoice-sheet { padding: 0 2px 0 0; box-sizing: border-box; background: #fff; }
  .invoice-print-root { break-after: avoid; }
  .invoice-print-root img { break-inside: avoid; page-break-inside: avoid; }
  .invoice-print-root tr, .invoice-print-root li { break-inside: avoid; }
}
`;

type Props = { summary: BillingSummary | null; open: boolean; onOpenChange: (open: boolean) => void };

export function InvoiceDialog({ summary, open, onOpenChange }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice</DialogTitle>
          <DialogDescription>Preview of the guest folio. Printing uses the layout below.</DialogDescription>
        </DialogHeader>
        {summary ? (
          <>
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[640px]">
                <InvoiceDocument summary={summary} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                Print invoice
              </Button>
            </div>
            {mounted
              ? createPortal(
                  <div className="invoice-print-root">
                    <style>{PRINT_CSS}</style>
                    <InvoiceDocument summary={summary} />
                  </div>,
                  document.body,
                )
              : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
