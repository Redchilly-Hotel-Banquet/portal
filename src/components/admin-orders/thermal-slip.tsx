"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { locationLabel, shortId, type AdminOrder } from "./types";

export type SlipKind = "kot" | "bill";

/** What the food bill header shows; from the branch's invoice details under Settings. */
export type SlipBranch = { legal_name?: string; gstin?: string; invoice_address?: string; invoice_phone?: string };

/** The roll the kitchen printer uses. 80 mm paper prints about 72 mm wide. */
const PAPER_MM = 80;
const FOOD_GST_RATE = 5;

const css = `
.thermal-print-root { display: none; }
@media print {
  @page { size: ${PAPER_MM}mm auto; margin: 2mm; }
  body > *:not(.thermal-print-root) { display: none !important; }
  .thermal-print-root { display: block !important; }
}
.thermal-slip { width: ${PAPER_MM - 8}mm; margin: 0 auto; color: #000; background: #fff; font-family: "Courier New", ui-monospace, monospace; font-size: 12px; line-height: 1.3; }
.thermal-slip h1 { font-size: 18px; text-align: center; margin: 0 0 6px; letter-spacing: 1px; }
.thermal-slip .c { text-align: center; }
.thermal-slip .rule { border-top: 1px dashed #000; margin: 4px 0; }
.thermal-slip .row { display: flex; justify-content: space-between; gap: 6px; }
.thermal-slip .b { font-weight: 700; }
.thermal-slip .big { font-size: 15px; }
.thermal-slip table { width: 100%; border-collapse: collapse; }
.thermal-slip th { text-align: left; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 2px 0; }
.thermal-slip td { padding: 2px 0; vertical-align: top; }
.thermal-slip .r { text-align: right; }
`;

const when = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return Number.isNaN(d.getTime())
    ? { date: "", time: "" }
    : { date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

function Kot({ order }: { order: AdminOrder }) {
  const { date, time } = when(order.created_at);
  const items = order.order_items ?? [];
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="thermal-slip">
      <h1>KOT</h1>
      <div className="row">
        <span className="b">KOT NO. {shortId(order._id)}</span>
        <span>{date}</span>
      </div>
      <div className="row">
        <span className="b uppercase">{locationLabel(order) || "No location"}</span>
        <span>{time}</span>
      </div>
      <div>SER. PERSON:</div>
      <table style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th>ITEMS</th>
            <th className="r">QTY</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td className="b">
                {(item.menu_items?.name ?? "Item").toUpperCase()}
                {item.notes ? <div style={{ fontWeight: 400 }}>** {item.notes}</div> : null}
              </td>
              <td className="r b big">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rule" />
      <div className="b">Item Qty: {totalQty}</div>
      {order.special_instructions ? <div style={{ marginTop: 4 }}>NOTE: {order.special_instructions}</div> : null}
      <div style={{ height: 16 }} />
    </div>
  );
}

function Bill({ order, branch }: { order: AdminOrder; branch?: SlipBranch }) {
  const { date, time } = when(order.created_at);
  const items = order.order_items ?? [];
  const subtotal = Math.round(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0) * 100) / 100;
  const half = Math.round(((subtotal * FOOD_GST_RATE) / 200) * 100) / 100;
  const net = Math.round(subtotal + half * 2);
  return (
    <div className="thermal-slip">
      {branch?.legal_name ? <div className="c b big">{branch.legal_name.toUpperCase()}</div> : null}
      {branch?.invoice_address ? <div className="c" style={{ whiteSpace: "pre-line" }}>{branch.invoice_address}</div> : null}
      {branch?.gstin ? <div className="c b">GSTIN: {branch.gstin}</div> : null}
      {branch?.invoice_phone ? <div className="c">Phone: {branch.invoice_phone}</div> : null}
      <div className="rule" />
      <div className="row">
        <span className="b">Bill No. {shortId(order._id)}</span>
        <span>Date: {date}</span>
      </div>
      <div className="row">
        <span className="b uppercase">{locationLabel(order) || "No location"}</span>
        <span>Time: {time}</span>
      </div>
      <div>SER. PERSON:</div>
      <table style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th>SR. ITEMS</th>
            <th className="r">QTY</th>
            <th className="r">RATE</th>
            <th className="r">AMT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td>
                {index + 1} {(item.menu_items?.name ?? "Item").toUpperCase()}
              </td>
              <td className="r">{item.quantity}</td>
              <td className="r">{Number(item.price).toFixed(2)}</td>
              <td className="r">{(Number(item.price) * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rule" />
      <div className="row"><span>SUB TOTAL</span><span>{subtotal.toFixed(2)}</span></div>
      <div className="row"><span>SGST @{FOOD_GST_RATE / 2}%:</span><span>{half.toFixed(2)}</span></div>
      <div className="row"><span>CGST @{FOOD_GST_RATE / 2}%:</span><span>{half.toFixed(2)}</span></div>
      <div className="rule" />
      <div className="row b big"><span>NET AMOUNT</span><span>{net.toFixed(2)}</span></div>
      <div className="rule" />
      <div className="c" style={{ marginTop: 6 }}>!!! Thanks !!! Visit Again !!!</div>
      <div style={{ height: 16 }} />
    </div>
  );
}

type Props = { order: AdminOrder | null; kind: SlipKind; branch?: SlipBranch; onDone: () => void };

/** Prints a kitchen slip (KOT) or food bill for one order, sized for the thermal printer, then calls onDone. */
export function ThermalSlip({ order, kind, branch, onDone }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !order) return;
    window.addEventListener("afterprint", onDone, { once: true });
    // Let the slip render into the page before the print dialog snapshots it.
    const timer = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", onDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, order]);

  if (!mounted || !order) return null;
  return createPortal(
    <div className="thermal-print-root">
      <style>{css}</style>
      {kind === "kot" ? <Kot order={order} /> : <Bill order={order} branch={branch} />}
    </div>,
    document.body,
  );
}
