"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DOCUMENT_LABEL, defaultsFor, normaliseInvoiceSettings, PAPER_SIZES, type DocumentKind } from "@/lib/invoice-settings";
import { InvoiceDocument } from "./invoice-document";
import type { BillingSummary } from "./types";

/** The print rules for the branch's chosen paper and margin (Settings → Configuration → Invoice). */
export const printCss = (paper: string, margin: number) => `
.invoice-print-root { display: none; }
@media print {
  @page { size: ${paper}; margin: ${margin}mm; }
  body > *:not(.invoice-print-root) { display: none !important; }
  .invoice-print-root { display: block !important; }
  .invoice-print-root .invoice-sheet { padding: 0 2px 0 0; box-sizing: border-box; background: #fff; }
  .invoice-print-root { break-after: avoid; }
  .invoice-print-root img { break-inside: avoid; page-break-inside: avoid; }
  .invoice-print-root tr, .invoice-print-root li { break-inside: avoid; }
}
`;

type Props = { summary: BillingSummary | null; open: boolean; onOpenChange: (open: boolean) => void; /** The invoice (default) or the shorter bill. */ kind?: DocumentKind };

export function InvoiceDialog({ summary, open, onOpenChange, kind = "invoice" }: Props) {
  const [mounted, setMounted] = useState(false);
  const invoiceSettings = normaliseInvoiceSettings(kind === "bill" ? summary?.bill_settings : summary?.invoice_settings, defaultsFor(kind));
  const label = DOCUMENT_LABEL[kind];
  useEffect(() => setMounted(true), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label.name}</DialogTitle>
          <DialogDescription>Preview of the {label.name.toLowerCase()}. Printing uses the layout below.</DialogDescription>
        </DialogHeader>
        {summary ? (
          <>
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[640px]">
                <InvoiceDocument summary={summary} kind={kind} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                Print {label.name.toLowerCase()}
              </Button>
            </div>
            {mounted
              ? createPortal(
                  <div className="invoice-print-root">
                    <style>{printCss(PAPER_SIZES[invoiceSettings.paper].css, invoiceSettings.margin_mm)}</style>
                    <InvoiceDocument summary={summary} kind={kind} />
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
