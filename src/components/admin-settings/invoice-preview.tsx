"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { InvoiceDocument } from "@/components/admin-bookings/invoice-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocumentTypes } from "@/hooks/useDocumentTypes";
import { PAPER_SIZES, type InvoiceSettings } from "@/lib/invoice-settings";
import { sampleSummary } from "./invoice-sample";

const PX_PER_MM = 96 / 25.4;
type Issuer = { legal_name: string; gstin: string; address: string; phone: string; email: string; terms: string };
type Page = { start: number; end: number };

/**
 * Splits the content into pages the way the printer does: each page holds as much as fits, but a row, a photo or a
 * section that must stay together is moved whole onto the next page instead of being cut in half.
 */
const paginate = (total: number, printable: number, keepTogether: Array<{ top: number; bottom: number }>): Page[] => {
  const pages: Page[] = [];
  let start = 0;
  while (start < total - 0.5) {
    let end = Math.min(start + printable, total);
    if (end < total) {
      for (let guard = 0, moved = true; moved && guard < 60; guard += 1) {
        moved = false;
        for (const box of keepTogether) {
          if (box.top > start + 1 && box.top < end - 0.5 && box.bottom > end + 0.5) {
            end = box.top;
            moved = true;
          }
        }
      }
      if (end <= start + 1) end = Math.min(start + printable, total); // taller than a page: it has to be cut
    }
    pages.push({ start, end });
    start = end;
  }
  return pages.length ? pages : [{ start: 0, end: total }];
};

/**
 * How the invoice prints with these settings: each printed page is shown as its own sheet of the chosen paper, in a
 * list the administrator scrolls through, for a sample stay with the number of guests they pick.
 */
export function InvoicePreview({ settings, issuer, guests, documentFor }: { settings: InvoiceSettings; issuer: Issuer; guests: number; documentFor: string[] }) {
  const types = useDocumentTypes();
  const paper = PAPER_SIZES[settings.paper];
  const margin = settings.margin_mm;
  const viewport = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [pages, setPages] = useState<Page[]>([{ start: 0, end: 0 }]);
  const summary = useMemo(() => sampleSummary(guests, types, issuer, documentFor), [guests, types, issuer, documentFor]);

  const sheetW = paper.width * PX_PER_MM;
  const contentW = (paper.width - 2 * margin) * PX_PER_MM;
  const printablePx = paper.height ? (paper.height - 2 * margin) * PX_PER_MM : null;

  // Fit the sheets to the width available, and work out where each page ends from the measured content.
  useLayoutEffect(() => {
    const update = () => {
      if (viewport.current) setScale(Math.min(1, (viewport.current.clientWidth - 16) / sheetW));
      const root = measure.current;
      if (!root) return;
      const total = root.scrollHeight;
      if (!printablePx) return setPages([{ start: 0, end: total }]);
      const top = root.getBoundingClientRect().top;
      const keep = Array.from(root.querySelectorAll<HTMLElement>(".break-inside-avoid, tr, li, img")).map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top - top, bottom: r.bottom - top };
      });
      setPages(paginate(total, printablePx, keep));
    };
    update();
    const observer = new ResizeObserver(update);
    if (viewport.current) observer.observe(viewport.current);
    if (measure.current) observer.observe(measure.current);
    return () => observer.disconnect();
  }, [sheetW, printablePx, settings, guests, summary]);

  const count = pages.length;
  const rollCm = !paper.height ? Math.round((pages[0].end / PX_PER_MM + 2 * margin) / 10) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          {paper.height ? <>Prints on <strong>{count} page{count === 1 ? "" : "s"}</strong> of {settings.paper}</> : <>One continuous {paper.width} mm roll, about <strong>{rollCm} cm</strong> long</>}
        </p>
      </div>

      {/* Measuring copy: laid out at the printable width, never seen. */}
      <div aria-hidden className="invoice-preview pointer-events-none absolute -left-[9999px] top-0 opacity-0" style={{ width: contentW }}>
        <style>{".invoice-preview .invoice-sheet{padding:0 !important}"}</style>
        <div ref={measure}><InvoiceDocument summary={summary} settings={settings} /></div>
      </div>

      <div ref={viewport} tabIndex={0} aria-label="Printed pages. Scroll to see each page." className="invoice-preview max-h-[calc(100vh-11rem)] min-h-[20rem] overflow-y-auto rounded-md border border-border bg-muted/40 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="mx-auto space-y-4" style={{ width: sheetW * scale }}>
          {pages.map((page, index) => {
            const pageH = paper.height ? paper.height * PX_PER_MM : page.end + 2 * margin * PX_PER_MM;
            return (
              <figure key={index} className="m-0">
                <div style={{ width: sheetW * scale, height: pageH * scale }} className="overflow-hidden bg-white shadow-md ring-1 ring-black/10">
                  <div style={{ width: sheetW, height: pageH, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative", boxSizing: "border-box" }}>
                    <div style={{ position: "absolute", left: margin * PX_PER_MM, top: margin * PX_PER_MM, width: contentW, height: page.end - page.start, overflow: "hidden" }}>
                      <div style={{ transform: `translateY(-${page.start}px)` }}>
                        <InvoiceDocument summary={summary} settings={settings} />
                      </div>
                    </div>
                  </div>
                </div>
                {paper.height ? <figcaption className="mt-1 text-center text-xs text-muted-foreground">Page {index + 1} of {count}</figcaption> : null}
              </figure>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">A sample stay with made-up guests and photos. Scroll to see each page; a row, photo or section is moved whole to the next page rather than cut, as when printing. Use empty lines to choose where a page ends.</p>
    </div>
  );
}
