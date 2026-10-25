import { Fragment, type ReactNode } from "react";
import { formatDate, formatDateTime, formatINR } from "@/components/admin/format";
import { statusLabel } from "@/components/admin/status-badge";
import { SITE } from "@/components/site/site-config";
import type { BillingSummary } from "./types";
import {
  assignedRooms,
  formatDocumentNumber,
  guestCountLabel,
  guestHeading,
  pairRooms,
  ROOM_STATUS_LABEL,
  roomMismatchNote,
} from "./invoice-details";
import { paymentModeLabel } from "@/lib/payment-modes";
import { roomChargeLines, gstBasis } from "./invoice-lines";
import { bookingTotal, outletLabel, stayNights } from "./utils";

const LABEL = "text-[10px] uppercase tracking-widest text-neutral-500";

/** Long free-text answers get the full row; short ones share it. */
const wide = (text?: string | null) => ((text?.length ?? 0) > 48 ? "col-span-2" : "");

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 break-inside-avoid ${className ?? ""}`}>
      <dt className={LABEL}>{label}</dt>
      <dd className="whitespace-pre-wrap break-words leading-snug">{children}</dd>
    </div>
  );
}

/** Plain, print-first folio. Uses fixed ink-on-paper styling so it prints identically in light and dark themes. */
export function InvoiceDocument({ summary }: { summary: BillingSummary }) {
  const { booking } = summary;
  const nights = stayNights(booking);
  const roomTotal = summary.roomTotal || bookingTotal(booking);
  const roomLines = roomChargeLines(booking, roomTotal, nights);
  const payments = booking.payments ?? [];
  const balanceDue = Math.max(Math.round((summary.grandTotal - payments.reduce((sum, payment) => sum + payment.amount, 0)) * 100) / 100, 0);
  const checkin = booking.checkin_details;
  const guests = checkin?.guests ?? [];
  const anyGuestSignature = guests.some((guest) => guest.signature_image?.data_url);
  const legacySignature = !anyGuestSignature && checkin?.signature?.data_url ? checkin.signature : null;
  const roomsAssigned = assignedRooms(booking);
  const roomRows = pairRooms(booking);
  const mismatchNote = roomMismatchNote(booking, roomsAssigned);
  const specialRequests = booking.special_requests?.trim();
  const otherRequests = checkin?.other_requests?.trim();
  const assistanceDetails = checkin?.special_assistance_details?.trim();
  // A submitted check-in record always answers the assistance question; absent means "No".
  const hasAssistanceAnswer = checkin?.needs_special_assistance !== undefined || Boolean(checkin?.status);
  const hasCheckinRequests =
    Boolean(checkin?.expected_arrival_time) ||
    hasAssistanceAnswer ||
    Boolean(otherRequests);
  const showRequests = Boolean(specialRequests) || hasCheckinRequests;
  const checkinDate = booking.checked_in_at ? formatDate(booking.checked_in_at) : "";

  return (
    <article className="invoice-sheet bg-white p-8 text-[12px] leading-snug text-neutral-900">
      <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-3">
        <div>
          <h2 className="font-display text-xl leading-tight text-neutral-900">{SITE.name}</h2>
          <p className="text-neutral-600">{SITE.descriptor}</p>
          <p className="mt-1 max-w-xs text-neutral-600">{SITE.address}</p>
          <p className="text-neutral-600">
            {SITE.phoneDisplay} | {SITE.email}
          </p>
        </div>
        <div className="text-right">
          <p className={LABEL}>Guest folio</p>
          <p className="font-mono text-sm">{booking.booking_code}</p>
          <p className="text-neutral-600">Status: {statusLabel(booking.status)}</p>
          <p className="text-neutral-600">Issued {formatDateTime(new Date())}</p>
        </div>
      </header>

      <section className="break-inside-avoid border-b border-neutral-300 py-3">
        <p className={LABEL}>Guest and booking</p>
        <dl className="mt-1.5 grid grid-cols-4 gap-x-4 gap-y-2">
          <Field label="Billed to">{booking.guest_name || "Not provided"}</Field>
          <Field label="Phone">{booking.guest_phone || "Not provided"}</Field>
          <Field label="Email" className="col-span-2">
            {booking.guest_email || "Not provided"}
          </Field>
          <Field label="Booking code">
            <span className="font-mono">{booking.booking_code || "Not provided"}</span>
          </Field>
          <Field label="Branch">{outletLabel(booking)}</Field>
          <Field label="Stay" className="col-span-2">
            {formatDate(booking.check_in_date)} to {formatDate(booking.check_out_date)}, {nights} night{nights === 1 ? "" : "s"}
          </Field>
          <Field label="Guests">{guestCountLabel(booking)}</Field>
          {booking.created_at ? <Field label="Booked on">{formatDateTime(booking.created_at)}</Field> : null}
          {booking.checked_in_at ? <Field label="Checked in">{formatDateTime(booking.checked_in_at)}</Field> : null}
          {booking.checked_out_at ? <Field label="Checked out">{formatDateTime(booking.checked_out_at)}</Field> : null}
        </dl>
      </section>

      {roomRows.length > 0 ? (
        <section className="break-inside-avoid border-b border-neutral-300 py-3">
          <p className={LABEL}>Room details</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-widest text-neutral-500">
                <th className="py-1 pr-3 font-medium">Requested room</th>
                <th className="py-1 pr-3 font-medium">Assigned room no.</th>
                <th className="py-1 pr-3 font-medium">Assigned type</th>
                <th className="py-1 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {roomRows.map((row) => (
                <tr key={row.line} className="border-b border-neutral-200 align-top">
                  <td className="py-1 pr-3">{row.requested ?? "Not specified"}</td>
                  <td className="py-1 pr-3 font-medium">{row.room ? row.room.number : "Not assigned yet"}</td>
                  <td className="py-1 pr-3">{row.room ? row.room.type : "-"}</td>
                  <td className={`py-1 text-right ${row.status === "different" ? "font-medium" : ""}`}>
                    {ROOM_STATUS_LABEL[row.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mismatchNote ? (
            <p className="mt-2 border border-neutral-400 px-2 py-1 font-medium">{mismatchNote}</p>
          ) : null}
        </section>
      ) : null}

      {showRequests ? (
        <section className="border-b border-neutral-300 py-3">
          <p className={LABEL}>Requests</p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-2">
            {specialRequests ? (
              <Field label="Booking special requests" className={wide(specialRequests)}>
                {specialRequests}
              </Field>
            ) : null}
            {checkin?.expected_arrival_time ? (
              <Field label="Expected arrival">{formatDateTime(checkin.expected_arrival_time)}</Field>
            ) : null}
            {hasAssistanceAnswer ? (
              <Field label="Special assistance" className={wide(assistanceDetails)}>
                {checkin?.needs_special_assistance
                  ? assistanceDetails
                    ? `Yes: ${assistanceDetails}`
                    : "Yes"
                  : "No"}
              </Field>
            ) : null}
            {otherRequests ? (
              <Field label="Other requests at check-in" className={wide(otherRequests)}>
                {checkin?.other_requests}
              </Field>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="py-3">
        <p className={LABEL}>Charges</p>
        <table className="mt-1 w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="py-1 font-medium">Description</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1 text-right font-medium">Rate</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="break-inside-avoid">
              <td colSpan={4} className="pb-0.5 pt-2 font-semibold">
                A. Room charges
              </td>
            </tr>
            {roomLines.map((line) => (
              <tr key={line.key} className="break-inside-avoid align-top">
                <td className="py-0.5 pl-3">{line.label}</td>
                <td className="py-0.5 text-right tabular-nums">
                  {line.nights} night{line.nights === 1 ? "" : "s"}
                </td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(line.rate)}</td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(line.amount)}</td>
              </tr>
            ))}
            <tr className="break-inside-avoid border-t border-neutral-200 font-medium">
              <td colSpan={3} className="py-1 text-right">
                Room charges (A)
              </td>
              <td className="py-1 text-right tabular-nums">{formatINR(roomTotal)}</td>
            </tr>

            <tr className="break-inside-avoid">
              <td colSpan={4} className="pb-0.5 pt-3 font-semibold">
                B. Food and beverages
              </td>
            </tr>
            {summary.orders.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-0.5 pl-3 text-neutral-500">
                  No food orders.
                </td>
              </tr>
            ) : null}
            {summary.orders.map((order) => (
              <Fragment key={order.id}>
                <tr className="break-inside-avoid align-top text-neutral-600">
                  <td colSpan={4} className="pb-0.5 pl-3 pt-1.5 text-[11px]">
                    Order {order.id.slice(0, 8).toUpperCase()}, {formatDateTime(order.created_at)}
                  </td>
                </tr>
                {(order.items ?? []).map((item, index) => (
                  <tr key={`${order.id}-${index}`} className="break-inside-avoid align-top">
                    <td className="py-px pl-6">
                      {item.name}
                      {item.notes ? <span className="text-neutral-500"> ({item.notes})</span> : null}
                    </td>
                    <td className="py-px text-right tabular-nums">{item.quantity}</td>
                    <td className="py-px text-right tabular-nums">{formatINR(item.price)}</td>
                    <td className="py-px text-right tabular-nums">{formatINR(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="break-inside-avoid border-t border-neutral-200 font-medium">
              <td colSpan={3} className="py-1 text-right">
                Food and beverages (B)
              </td>
              <td className="py-1 text-right tabular-nums">{formatINR(summary.foodTotal)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="break-inside-avoid border-t border-neutral-400 font-semibold">
              <td colSpan={3} className="pt-1.5 text-right">
                Total before GST (A + B)
              </td>
              <td className="pt-1.5 text-right tabular-nums">{formatINR(summary.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="break-inside-avoid border-t border-neutral-300 py-3">
        <p className={LABEL}>GST (CGST and SGST, Uttar Pradesh)</p>
        <table className="mt-1 w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="py-1 font-medium">Charge</th>
              <th className="py-1 text-right font-medium">Taxable value</th>
              <th className="py-1 text-right font-medium">CGST</th>
              <th className="py-1 text-right font-medium">SGST</th>
              <th className="py-1 text-right font-medium">Total GST</th>
            </tr>
          </thead>
          <tbody>
            {summary.gst.lines.map((line, index) => (
              <tr key={`${line.kind}-${line.rate}-${index}`} className="break-inside-avoid border-b border-neutral-200 align-top">
                <td className="py-1 pr-3">
                  <p className="font-medium">
                    {line.description} at {line.rate}%
                  </p>
                  <p className="text-[10px] text-neutral-500">{gstBasis(line, formatINR)}</p>
                </td>
                <td className="py-1 text-right tabular-nums">{formatINR(line.taxable)}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatINR(line.cgst)}
                  <span className="block text-[10px] text-neutral-500">{line.rate / 2}%</span>
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatINR(line.sgst)}
                  <span className="block text-[10px] text-neutral-500">{line.rate / 2}%</span>
                </td>
                <td className="py-1 text-right tabular-nums">{formatINR(line.cgst + line.sgst)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="pt-1">Total</td>
              <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.taxable)}</td>
              <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.cgst)}</td>
              <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.sgst)}</td>
              <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.gst)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="break-inside-avoid border-t border-neutral-300 py-3">
        <p className={LABEL}>Amount payable</p>
        <table className="mt-1 ml-auto w-full max-w-sm border-collapse">
          <tbody>
            <tr>
              <td className="py-0.5">Total before GST</td>
              <td className="py-0.5 text-right tabular-nums">{formatINR(summary.gst.taxable)}</td>
            </tr>
            <tr>
              <td className="py-0.5">
                Add: GST
                <span className="block text-[10px] text-neutral-500">
                  CGST {formatINR(summary.gst.cgst)} + SGST {formatINR(summary.gst.sgst)}
                </span>
              </td>
              <td className="py-0.5 text-right tabular-nums">{formatINR(summary.gst.gst)}</td>
            </tr>
            {summary.gst.roundOff !== 0 ? (
              <tr>
                <td className="py-0.5">Round off</td>
                <td className="py-0.5 text-right tabular-nums">
                  {summary.gst.roundOff > 0 ? "+" : "-"}
                  {formatINR(Math.abs(summary.gst.roundOff))}
                </td>
              </tr>
            ) : null}
            <tr className="border-t border-neutral-400 text-sm font-semibold">
              <td className="pt-1.5">Total payable</td>
              <td className="pt-1.5 text-right tabular-nums">{formatINR(summary.grandTotal)}</td>
            </tr>
            {payments.map((payment, index) => (
              <tr key={`pay-${index}`} className="text-neutral-700">
                <td className="py-0.5">
                  Less: paid by {paymentModeLabel(payment.mode)}
                  {payment.reference ? ` (${payment.reference})` : ""}
                </td>
                <td className="py-0.5 text-right tabular-nums">-{formatINR(payment.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-300 font-semibold">
              <td className="pt-1">Balance due</td>
              <td className="pt-1 text-right tabular-nums">{formatINR(balanceDue)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {guests.length > 0 || legacySignature ? (
        <section className="border-t border-neutral-300 py-3">
          <p className={LABEL}>Guests and verification</p>

          {guests.length > 0 ? (
            <ul className="mt-1.5 grid grid-cols-2 gap-3">
              {guests.map((guest, index) => (
                <li key={`${guest.full_name}-${index}`} className="break-inside-avoid border border-neutral-300 p-2.5">
                  <p className="font-medium leading-tight">{guestHeading(guest, index, booking.number_of_guests)}</p>
                  <p className="text-[11px] text-neutral-600">
                    {guest.document_type || "Document"}: {formatDocumentNumber(guest.document_type, guest.document_number)}
                  </p>
                  {/* Fixed physical sizes: an ID card must stay legible however many guests share the page. */}
                  {guest.document_image?.data_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={guest.document_image.data_url}
                      alt={`${guest.document_type} of ${guest.full_name}`}
                      className="mt-2 block h-[50mm] w-full shrink-0 rounded-sm border border-neutral-300 bg-white object-contain"
                    />
                  ) : null}
                  {guest.signature_image?.data_url ? (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={guest.signature_image.data_url}
                        alt={`Signature of ${guest.full_name}`}
                        className="block h-[16mm] w-full shrink-0 border-b border-neutral-400 bg-white object-contain object-left"
                      />
                      <p className="mt-0.5 text-[10px] text-neutral-600">
                        Signature{checkinDate ? `, ${checkinDate}` : ""}
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {legacySignature ? (
            <div className="mt-3 max-w-[16rem] break-inside-avoid">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={legacySignature.data_url}
                alt={`Signature of ${booking.guest_name ?? "guest"}`}
                className="h-[16mm] w-full border-b border-neutral-400 bg-white object-contain object-left"
              />
              <p className="mt-0.5 text-[10px] text-neutral-600">Guest signature{checkinDate ? `, ${checkinDate}` : ""}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="break-inside-avoid border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
        <p>
          Generated by the property management system and reflects charges recorded at the time of issue. Thank you for
          staying with {SITE.name}.
        </p>
      </footer>
    </article>
  );
}
