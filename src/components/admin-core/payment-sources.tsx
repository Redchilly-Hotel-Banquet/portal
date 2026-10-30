import { PieBreakdown } from "./chart-parts";
import { Money } from "@/components/admin/money";
import { formatINR, formatNumber } from "@/components/admin/format";
import { PAYMENT_MODES, paymentModeLabel } from "@/lib/payment-modes";
import { toNumber, type OutletAnalytics } from "./analytics-types";

/** Money received at check-out, split by how the guest paid. */
export function PaymentSources({ outlets }: { outlets: OutletAnalytics[] }) {
  const amounts = new Map<string, number>();
  const counts = new Map<string, number>();
  let gst = 0;
  for (const outlet of outlets) {
    for (const [mode, amount] of Object.entries(outlet.payments_by_mode ?? {})) amounts.set(mode, (amounts.get(mode) ?? 0) + toNumber(amount));
    for (const [mode, count] of Object.entries(outlet.payment_counts ?? {})) counts.set(mode, (counts.get(mode) ?? 0) + toNumber(count));
    gst += toNumber(outlet.gst_collected);
  }

  const known: string[] = PAYMENT_MODES.map((mode) => mode.value);
  const modes = [...known.filter((mode) => amounts.has(mode)), ...Array.from(amounts.keys()).filter((mode) => !known.includes(mode))];
  const total = modes.reduce((sum, mode) => sum + (amounts.get(mode) ?? 0), 0);

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="text-lg">Payments by source</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Money received at check-out, including GST, by how the guest paid.
      </p>
      {modes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments recorded yet. They appear as guests check out.</p>
      ) : (
        <>
          <PieBreakdown label="Pie chart of payments by source" format={formatINR} slices={modes.map((mode) => ({ name: paymentModeLabel(mode), value: amounts.get(mode) ?? 0 }))} />
          <ul className="mt-4 space-y-3">
            {modes.map((mode) => {
              const amount = amounts.get(mode) ?? 0;
              const share = total ? (amount / total) * 100 : 0;
              return (
                <li key={mode}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{paymentModeLabel(mode)}</span>
                    <span className="tabular-nums">
                      <Money value={amount} className="font-medium" />
                      <span className="ml-2 text-xs text-muted-foreground">
                        {share.toFixed(0)}% · {formatNumber(counts.get(mode) ?? 0)} payment{(counts.get(mode) ?? 0) === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share, 1)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm">
            <div className="flex gap-2"><dt className="text-muted-foreground">Total received</dt><dd className="font-semibold tabular-nums"><Money value={total} /></dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground">of which GST</dt><dd className="tabular-nums"><Money value={gst} /></dd></div>
          </dl>
        </>
      )}
    </section>
  );
}
