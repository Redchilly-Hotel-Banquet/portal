import { Fragment } from "react";
import { formatINR } from "@/components/admin/format";
import { gstBasis } from "./invoice-lines";
import type { ExtraCharge, GstSummary } from "./types";

/**
 * The bill worked out step by step: each charge, the GST on it and why that rate applies, then the totals.
 * Used by the checkout form and the bill panel.
 */
export function GstBreakdown({ gst, extraCharges = [], className }: { gst: GstSummary; extraCharges?: ExtraCharge[]; className?: string }) {
  const extraTotal = Math.round(extraCharges.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100;
  return (
    <dl className={`divide-y rounded-md border bg-card px-4 text-sm ${className ?? ""}`}>
      {gst.lines.map((line, index) => (
        <Fragment key={`${line.kind}-${line.rate}-${index}`}>
          <Row label={line.description} value={formatINR(line.taxable)} />
          <Row
            small
            label={`GST ${line.rate}% = CGST ${line.rate / 2}% ${formatINR(line.cgst)} + SGST ${line.rate / 2}% ${formatINR(line.sgst)}`}
            value={`+ ${formatINR(line.cgst + line.sgst)}`}
          />
          <p className="py-1 pl-4 text-[11px] text-muted-foreground">{gstBasis(line, formatINR)}</p>
        </Fragment>
      ))}
      <Row label="Total before GST" value={formatINR(gst.taxable)} />
      <Row label={`Total GST (CGST ${formatINR(gst.cgst)} + SGST ${formatINR(gst.sgst)})`} value={`+ ${formatINR(gst.gst)}`} />
      {gst.roundOff !== 0 ? <Row small label="Round off to the nearest rupee" value={`${gst.roundOff > 0 ? "+" : "-"} ${formatINR(Math.abs(gst.roundOff))}`} /> : null}
      {extraCharges.map((entry) => (
        <Row key={entry.id} label={`${entry.description} (extra charge, no GST)`} value={`+ ${formatINR(entry.amount)}`} />
      ))}
      <Row strong label="Total payable" value={formatINR(Math.round((gst.total + extraTotal) * 100) / 100)} />
    </dl>
  );
}

function Row({ label, value, small, strong }: { label: string; value: string; small?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${small ? "pl-4 text-xs text-muted-foreground" : ""} ${strong ? "text-base font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}
