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
import { formatPhone } from "@/lib/phone";
import { DOCUMENT_LABEL, LINE_MM, defaultsFor, documentPrints, documentSidePrints, normaliseInvoiceSettings, type DocumentKind, type InvoiceSettings } from "@/lib/invoice-settings";
import { paymentModeLabel } from "@/lib/payment-modes";
import { roomChargeLines, gstBasis } from "./invoice-lines";
import { bookingTotal, outletLabel, stayNights } from "./utils";

/** Every photo of a guest's identity document, in order (older records have just the one). */
const documentPhotos = (guest: { document_image?: { data_url?: string } | null; document_images?: Array<{ data_url?: string } | null> }): Array<{ data_url: string }> => {
  const list = (guest.document_images?.length ? guest.document_images : [guest.document_image]).filter((file): file is { data_url: string } => Boolean(file?.data_url));
  return list;
};

/** Empty lines the administrator added (Settings → Invoice), so the invoice can be fitted to its pages. */
function Gap({ lines }: { lines: number }) {
  return lines > 0 ? <div aria-hidden className="invoice-gap" style={{ height: `${lines * LINE_MM}mm` }} /> : null;
}

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
export function InvoiceDocument({ summary, settings, kind = "invoice" }: { summary: BillingSummary; settings?: InvoiceSettings; kind?: DocumentKind }) {
  const { booking } = summary;
  // What to show comes from Settings for the branch; a preview passes its own.
  const cfg = settings ?? normaliseInvoiceSettings(kind === "bill" ? summary.bill_settings : summary.invoice_settings, defaultsFor(kind));
  const show = cfg.show;
  // The branch's own details from Settings; the site-wide ones fill in anything left blank.
  const inv = summary.invoice;
  const issuer = {
    name: inv?.legal_name || SITE.name,
    descriptor: inv?.legal_name ? "" : SITE.descriptor,
    address: inv?.address || SITE.address,
    phone: inv?.phone || SITE.phoneDisplay,
    email: inv?.email || SITE.email,
    gstin: inv?.gstin ?? "",
  };
  const contactLine = [show.branch_phone ? issuer.phone : "", show.branch_email ? issuer.email : ""].filter(Boolean).join(" | ");
  const guestSectionShown = [show.billed_to, show.guest_phone, show.guest_email, show.booking_code, show.branch_name, show.stay_dates, show.guest_count, show.booked_on, show.checked_in_at, show.checked_out_at].some(Boolean);
  const roomColumns = [show.col_requested_room, show.col_assigned_room, show.col_assigned_type, show.col_room_status].filter(Boolean).length;
  const payableShown = show.amount_payable && [show.pay_before_gst, show.pay_gst, show.pay_round_off, show.pay_total, show.payments, show.balance_due].some(Boolean);
  const bothBlocks = show.room_charges && show.food_charges;
  const chargeColumns = 2 + (show.charge_qty ? 1 : 0) + (show.charge_rate ? 1 : 0);
  const nights = stayNights(booking);
  const roomTotal = summary.roomTotal || bookingTotal(booking);
  const roomLines = roomChargeLines(booking, roomTotal, nights);
  const extraCharges = summary.extraCharges ?? [];
  const extraTotal = summary.extraTotal ?? 0;
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
  const requestsShown = (show.request_special && Boolean(specialRequests)) || (show.request_arrival && Boolean(checkin?.expected_arrival_time)) || (show.request_assistance && hasAssistanceAnswer) || (show.request_other && Boolean(otherRequests));
  // Guest register: the booking's own contact stands in until check-in has recorded who actually arrived.
  const registerGuests = guests.length > 0 ? guests : [{ full_name: booking.guest_name ?? "", phone: booking.guest_phone } as (typeof guests)[number]];
  const arrivingFrom = checkin?.arriving_from?.trim();
  const reasonForStay = checkin?.reason_for_stay?.trim();
  const arrival = booking.checked_in_at || checkin?.expected_arrival_time || "";
  const DASH = "-";
  const issuedFields = <Field label="Date">{formatDate(new Date())}</Field>;
  const checkinDate = booking.checked_in_at ? formatDate(booking.checked_in_at) : "";

  return (
    <article className="invoice-sheet bg-white p-8 text-[12px] leading-snug text-neutral-900">
      <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-3">
        <div className="flex items-start gap-3">
          {show.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.jpeg" alt={SITE.name} className="h-14 w-14 shrink-0 rounded-sm object-cover" />
          ) : null}
          <div>
          {show.heading_name ? <h2 className="font-display text-xl leading-tight text-neutral-900">{issuer.name}</h2> : null}
          {show.heading_name && issuer.descriptor ? <p className="text-neutral-600">{issuer.descriptor}</p> : null}
          {show.branch_address ? <p className="mt-1 max-w-xs whitespace-pre-line text-neutral-600">{issuer.address}</p> : null}
          {contactLine ? <p className="text-neutral-600">{contactLine}</p> : null}
          {show.gstin && issuer.gstin ? <p className="mt-0.5 font-medium text-neutral-800">GSTIN: <span className="font-mono">{issuer.gstin}</span></p> : null}
          </div>
        </div>
        <div className="text-right">
          {show.heading_code ? <p className={LABEL}>{DOCUMENT_LABEL[kind].heading}</p> : null}
          {show.heading_code ? <p className="font-mono text-sm">{booking.booking_code}</p> : null}
          {show.folio_status ? <p className="text-neutral-600">Status: {statusLabel(booking.status)}</p> : null}
          {show.issued_date ? <p className="text-neutral-600">Issued {formatDateTime(new Date())}</p> : null}
        </div>
      </header>
      <Gap lines={cfg.spacers.after_header} />

      {guestSectionShown ? (
      <section className="break-inside-avoid border-b border-neutral-300 py-3">
        <p className={LABEL}>Guest and booking</p>
        <dl className="mt-1.5 grid grid-cols-4 gap-x-4 gap-y-2">
          {show.billed_to ? <Field label="Billed to">{booking.guest_name || "Not provided"}</Field> : null}
          {show.guest_phone ? <Field label="Phone">{formatPhone(booking.guest_phone) || "Not provided"}</Field> : null}
          {show.guest_email ? (
            <Field label="Email" className="col-span-2">
              {booking.guest_email || "Not provided"}
            </Field>
          ) : null}
          {show.booking_code ? (
            <Field label="Booking code">
              <span className="font-mono">{booking.booking_code || "Not provided"}</span>
            </Field>
          ) : null}
          {show.branch_name ? <Field label="Branch">{outletLabel(booking)}</Field> : null}
          {show.stay_dates ? (
            <Field label="Stay" className="col-span-2">
              {formatDate(booking.check_in_date)} to {formatDate(booking.check_out_date)}, {nights} night{nights === 1 ? "" : "s"}
            </Field>
          ) : null}
          {show.guest_count ? <Field label="Guests">{guestCountLabel(booking)}</Field> : null}
          {show.booked_on && booking.created_at ? <Field label="Booked on">{formatDateTime(booking.created_at)}</Field> : null}
          {show.checked_in_at && booking.checked_in_at ? <Field label="Checked in">{formatDateTime(booking.checked_in_at)}</Field> : null}
          {show.checked_out_at && booking.checked_out_at ? <Field label="Checked out">{formatDateTime(booking.checked_out_at)}</Field> : null}
        </dl>
        <Gap lines={cfg.spacers.after_guest} />
      </section>
      ) : null}

      {show.register ? (
        <section className="break-inside-avoid border-b border-neutral-300 py-3">
          <p className={LABEL}>Guest register</p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-2">
            {issuedFields}
            {show.reg_arriving_from ? <Field label="Arriving from">{arrivingFrom || DASH}</Field> : null}
            {show.reg_arrival ? <Field label="Date and time of arrival">{arrival ? formatDateTime(arrival) : DASH}</Field> : null}
            {show.reg_reason ? <Field label="Reason for stay">{reasonForStay || DASH}</Field> : null}
            {show.reg_duration ? (
              <Field label="Duration of stay">
                {nights} night{nights === 1 ? "" : "s"} ({formatDate(booking.check_in_date)} to {formatDate(booking.check_out_date)})
              </Field>
            ) : null}
            {show.reg_room ? <Field label="Room number">{roomsAssigned.length > 0 ? roomsAssigned.map((room) => room.code).join(", ") : DASH}</Field> : null}
          </dl>
          {registerGuests.map((guest, index) => (
            <dl key={`${guest.full_name}-${index}`} className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-200 pt-2">
              <Field label={registerGuests.length > 1 ? `Name (guest ${index + 1})` : "Name"}>{guest.full_name || DASH}</Field>
              <Field label="Mobile">{formatPhone(guest.phone ?? (index === 0 ? booking.guest_phone : "")) || DASH}</Field>
              {show.reg_age ? <Field label="Age">{guest.age != null ? guest.age : DASH}</Field> : null}
              {show.reg_nationality ? <Field label="Nationality">{guest.nationality || DASH}</Field> : null}
              {show.reg_address ? <Field label="Permanent address" className="col-span-2">{guest.permanent_address || DASH}</Field> : null}
            </dl>
          ))}
          {show.reg_guest_signature || show.reg_manager_signature ? (
            <div className="mt-4 grid grid-cols-2 gap-x-8 break-inside-avoid">
              {show.reg_guest_signature ? (
                <div>
                  {registerGuests.length > 0 && registerGuests[0].signature_image?.data_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={registerGuests[0].signature_image.data_url} alt={`Signature of ${registerGuests[0].full_name}`} className="block w-full border-b border-neutral-500 bg-white object-contain object-left" style={{ height: `${cfg.signature_height_mm}mm` }} />
                  ) : (
                    <div className="border-b border-neutral-500" style={{ height: `${cfg.signature_height_mm}mm` }} />
                  )}
                  <p className="mt-0.5 text-[10px] text-neutral-600">Signature of guest</p>
                </div>
              ) : <span />}
              {show.reg_manager_signature ? (
                <div>
                  {checkin?.staff_signature?.data_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={checkin.staff_signature.data_url} alt={`Signature of ${checkin.staff_signature.name ?? "hotel staff"}`} className="block w-full border-b border-neutral-500 bg-white object-contain object-left" style={{ height: `${cfg.signature_height_mm}mm` }} />
                  ) : (
                    <div className="border-b border-neutral-500" style={{ height: `${cfg.signature_height_mm}mm` }} />
                  )}
                  <p className="mt-0.5 text-[10px] text-neutral-600">
                    Signature of manager or authorised person{checkin?.staff_signature?.name ? `: ${checkin.staff_signature.name}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {show.room_details && roomRows.length > 0 && roomColumns > 0 ? (
        <section className="break-inside-avoid border-b border-neutral-300 py-3">
          <p className={LABEL}>Room details</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-widest text-neutral-500">
                {show.col_requested_room ? <th className="py-1 pr-3 font-medium">Requested room</th> : null}
                {show.col_assigned_room ? <th className="py-1 pr-3 font-medium">Assigned room no.</th> : null}
                {show.col_assigned_type ? <th className="py-1 pr-3 font-medium">Assigned type</th> : null}
                {show.col_room_status ? <th className="py-1 text-right font-medium">Status</th> : null}
              </tr>
            </thead>
            <tbody>
              {roomRows.map((row) => (
                <tr key={row.line} className="border-b border-neutral-200 align-top">
                  {show.col_requested_room ? <td className="py-1 pr-3">{row.requested ?? "Not specified"}</td> : null}
                  {show.col_assigned_room ? <td className="py-1 pr-3 font-medium">{row.room ? row.room.number : "Not assigned yet"}</td> : null}
                  {show.col_assigned_type ? <td className="py-1 pr-3">{row.room ? row.room.type : "-"}</td> : null}
                  {show.col_room_status ? (
                    <td className={`py-1 text-right ${row.status === "different" ? "font-medium" : ""}`}>
                      {ROOM_STATUS_LABEL[row.status]}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {show.room_mismatch_note && mismatchNote ? (
            <p className="mt-2 border border-neutral-400 px-2 py-1 font-medium">{mismatchNote}</p>
          ) : null}
          <Gap lines={cfg.spacers.after_rooms} />
      </section>
      ) : null}

      {show.requests && requestsShown ? (
        <section className="border-b border-neutral-300 py-3">
          <p className={LABEL}>Requests</p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-2">
            {show.request_special && specialRequests ? (
              <Field label="Booking special requests" className={wide(specialRequests)}>
                {specialRequests}
              </Field>
            ) : null}
            {show.request_arrival && checkin?.expected_arrival_time ? (
              <Field label="Expected arrival">{formatDateTime(checkin.expected_arrival_time)}</Field>
            ) : null}
            {show.request_assistance && hasAssistanceAnswer ? (
              <Field label="Special assistance" className={wide(assistanceDetails)}>
                {checkin?.needs_special_assistance
                  ? assistanceDetails
                    ? `Yes: ${assistanceDetails}`
                    : "Yes"
                  : "No"}
              </Field>
            ) : null}
            {show.request_other && otherRequests ? (
              <Field label="Other requests at check-in" className={wide(otherRequests)}>
                {checkin?.other_requests}
              </Field>
            ) : null}
          </dl>
          <Gap lines={cfg.spacers.after_requests} />
      </section>
      ) : null}

      {show.charges ? (
      <section className="py-3">
        <p className={LABEL}>Charges</p>
        <table className="mt-1 w-full border-collapse">
          {show.charge_headings ? (
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="py-1 font-medium">Description</th>
              {show.charge_qty ? <th className="py-1 text-right font-medium">Qty</th> : null}
              {show.charge_rate ? <th className="py-1 text-right font-medium">Rate</th> : null}
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          ) : null}
          <tbody>
            {show.room_charges ? (
            <>
            <tr className="break-inside-avoid">
              <td colSpan={chargeColumns} className="pb-0.5 pt-2 font-semibold">
                {bothBlocks ? "A. Room charges" : "Room charges"}
              </td>
            </tr>
            {roomLines.map((line) => (
              <tr key={line.key} className="break-inside-avoid align-top">
                <td className="py-0.5 pl-3">
                  {line.label}
                  {show.room_period && line.period ? <span className="block text-[10px] text-neutral-500">{line.period}</span> : null}
                </td>
                {show.charge_qty ? (
                  <td className="py-0.5 text-right tabular-nums">
                    {line.nights} night{line.nights === 1 ? "" : "s"}
                  </td>
                ) : null}
                {show.charge_rate ? <td className="py-0.5 text-right tabular-nums">{formatINR(line.rate)}</td> : null}
                <td className="py-0.5 text-right tabular-nums">{formatINR(line.amount)}</td>
              </tr>
            ))}
            {show.room_subtotal ? (
            <tr className="break-inside-avoid border-t border-neutral-200 font-medium">
              <td colSpan={chargeColumns - 1} className="py-1 text-right">
                {bothBlocks ? "Room charges (A)" : "Room charges"}
              </td>
              <td className="py-1 text-right tabular-nums">{formatINR(roomTotal)}</td>
            </tr>
            ) : null}

            </>
            ) : null}

            {show.food_charges ? (
            <>
            <tr className="break-inside-avoid">
              <td colSpan={chargeColumns} className="pb-0.5 pt-3 font-semibold">
                {bothBlocks ? "B. Food and beverages" : "Food and beverages"}
              </td>
            </tr>
            {show.food_items && summary.orders.length === 0 ? (
              <tr>
                <td colSpan={chargeColumns} className="py-0.5 pl-3 text-neutral-500">
                  No food orders.
                </td>
              </tr>
            ) : null}
            {(show.food_items ? summary.orders : []).map((order) => (
              <Fragment key={order.id}>
                <tr className="break-inside-avoid align-top text-neutral-600">
                  <td colSpan={chargeColumns} className="pb-0.5 pl-3 pt-1.5 text-[11px]">
                    {show.food_order_heading ? `Order ${order.id.slice(0, 8).toUpperCase()}, ${formatDateTime(order.created_at)}` : ""}
                  </td>
                </tr>
                {(order.items ?? []).map((item, index) => (
                  <tr key={`${order.id}-${index}`} className="break-inside-avoid align-top">
                    <td className="py-px pl-6">
                      {item.name}
                      {item.notes ? <span className="text-neutral-500"> ({item.notes})</span> : null}
                    </td>
                    {show.charge_qty ? <td className="py-px text-right tabular-nums">{item.quantity}</td> : null}
                    {show.charge_rate ? <td className="py-px text-right tabular-nums">{formatINR(item.price)}</td> : null}
                    <td className="py-px text-right tabular-nums">{formatINR(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {show.food_subtotal ? (
            <tr className="break-inside-avoid border-t border-neutral-200 font-medium">
              <td colSpan={chargeColumns - 1} className="py-1 text-right">
                {bothBlocks ? "Food and beverages (B)" : "Food and beverages"}
              </td>
              <td className="py-1 text-right tabular-nums">{formatINR(summary.foodTotal)}</td>
            </tr>
            ) : null}
            </>
            ) : null}

            {extraCharges.length > 0 ? (
            <>
            <tr className="break-inside-avoid">
              <td colSpan={chargeColumns} className="pb-0.5 pt-3 font-semibold">Extra charges (no GST)</td>
            </tr>
            {extraCharges.map((charge) => (
              <tr key={charge.id} className="break-inside-avoid align-top">
                <td className="py-px pl-3">{charge.description}</td>
                {show.charge_qty ? <td /> : null}
                {show.charge_rate ? <td /> : null}
                <td className="py-px text-right tabular-nums">{formatINR(charge.amount)}</td>
              </tr>
            ))}
            </>
            ) : null}
          </tbody>
          {show.charges_total ? (
          <tfoot>
            <tr className="break-inside-avoid border-t border-neutral-400 font-semibold">
              <td colSpan={chargeColumns - 1} className="pt-1.5 text-right">
                {bothBlocks ? "Total before GST (A + B)" : "Total before GST"}
              </td>
              <td className="pt-1.5 text-right tabular-nums">{formatINR(summary.subtotal)}</td>
            </tr>
          </tfoot>
          ) : null}
        </table>
        <Gap lines={cfg.spacers.after_charges} />
      </section>
      ) : null}

      {show.gst_breakdown ? (
      <section className="break-inside-avoid border-t border-neutral-300 py-3">
        <p className={LABEL}>GST (CGST and SGST, Uttar Pradesh)</p>
        <table className="mt-1 w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="py-1 font-medium">Charge</th>
              {show.gst_taxable ? <th className="py-1 text-right font-medium">Taxable value</th> : null}
              {show.gst_cgst ? <th className="py-1 text-right font-medium">CGST</th> : null}
              {show.gst_sgst ? <th className="py-1 text-right font-medium">SGST</th> : null}
              {show.gst_total ? <th className="py-1 text-right font-medium">Total GST</th> : null}
            </tr>
          </thead>
          <tbody>
            {summary.gst.lines.map((line, index) => (
              <tr key={`${line.kind}-${line.rate}-${index}`} className="break-inside-avoid border-b border-neutral-200 align-top">
                <td className="py-1 pr-3">
                  <p className="font-medium">
                    {line.description} at {line.rate}%
                  </p>
                  {show.gst_basis ? <p className="text-[10px] text-neutral-500">{gstBasis(line, formatINR)}</p> : null}
                </td>
                {show.gst_taxable ? <td className="py-1 text-right tabular-nums">{formatINR(line.taxable)}</td> : null}
                {show.gst_cgst ? (
                  <td className="py-1 text-right tabular-nums">
                    {formatINR(line.cgst)}
                    <span className="block text-[10px] text-neutral-500">{line.rate / 2}%</span>
                  </td>
                ) : null}
                {show.gst_sgst ? (
                  <td className="py-1 text-right tabular-nums">
                    {formatINR(line.sgst)}
                    <span className="block text-[10px] text-neutral-500">{line.rate / 2}%</span>
                  </td>
                ) : null}
                {show.gst_total ? <td className="py-1 text-right tabular-nums">{formatINR(line.cgst + line.sgst)}</td> : null}
              </tr>
            ))}
            {show.gst_total_row ? (
            <tr className="font-medium">
              <td className="pt-1">Total</td>
              {show.gst_taxable ? <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.taxable)}</td> : null}
              {show.gst_cgst ? <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.cgst)}</td> : null}
              {show.gst_sgst ? <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.sgst)}</td> : null}
              {show.gst_total ? <td className="pt-1 text-right tabular-nums">{formatINR(summary.gst.gst)}</td> : null}
            </tr>
            ) : null}
          </tbody>
        </table>
        <Gap lines={cfg.spacers.after_gst} />
      </section>
      ) : null}

      {payableShown ? (
      <section className="break-inside-avoid border-t border-neutral-300 py-3">
        <p className={LABEL}>Amount payable</p>
        <table className="mt-1 ml-auto w-full max-w-sm border-collapse">
          <tbody>
            {show.pay_before_gst ? (
              <tr>
                <td className="py-0.5">Total before GST</td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(summary.gst.taxable)}</td>
              </tr>
            ) : null}
            {show.pay_gst ? (
              <tr>
                <td className="py-0.5">
                  Add: GST
                  <span className="block text-[10px] text-neutral-500">
                    CGST {formatINR(summary.gst.cgst)} + SGST {formatINR(summary.gst.sgst)}
                  </span>
                </td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(summary.gst.gst)}</td>
              </tr>
            ) : null}
            {show.pay_round_off && summary.gst.roundOff !== 0 ? (
              <tr>
                <td className="py-0.5">Round off</td>
                <td className="py-0.5 text-right tabular-nums">
                  {summary.gst.roundOff > 0 ? "+" : "-"}
                  {formatINR(Math.abs(summary.gst.roundOff))}
                </td>
              </tr>
            ) : null}
            {extraCharges.length > 0 ? (
              <tr>
                <td className="py-0.5">Add: Extra charges (no GST)</td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(extraTotal)}</td>
              </tr>
            ) : null}
            {show.pay_total ? (
              <tr className="border-t border-neutral-400 text-sm font-semibold">
                <td className="pt-1.5">Total payable</td>
                <td className="pt-1.5 text-right tabular-nums">{formatINR(summary.grandTotal)}</td>
              </tr>
            ) : null}
            {(show.payments ? payments : []).map((payment, index) => (
              <tr key={`pay-${index}`} className="text-neutral-700">
                <td className="py-0.5">
                  Less: paid by {paymentModeLabel(payment.mode)}
                  {payment.reference ? ` (${payment.reference})` : ""}
                </td>
                <td className="py-0.5 text-right tabular-nums">-{formatINR(payment.amount)}</td>
              </tr>
            ))}
            {show.balance_due ? (
              <tr className="border-t border-neutral-300 font-semibold">
                <td className="pt-1">Balance due</td>
                <td className="pt-1 text-right tabular-nums">{formatINR(balanceDue)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <Gap lines={cfg.spacers.after_payable} />
      </section>
      ) : null}

      {show.guest_verification && (guests.length > 0 || legacySignature) ? (
        <section className="border-t border-neutral-300 py-3">
          <p className={LABEL}>Guests and verification</p>

          {guests.length > 0 ? (
            <ul className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${cfg.guests_per_row}, minmax(0, 1fr))`, columnGap: `${cfg.guest_column_gap_mm}mm`, rowGap: `calc(3mm + ${cfg.guest_row_gap_lines * LINE_MM}mm)` }}>
              {guests.map((guest, index) => (
                <li key={`${guest.full_name}-${index}`} className="break-inside-avoid border border-neutral-300 p-2.5">
                  <p className="font-medium leading-tight">{guestHeading(guest, index, booking.number_of_guests)}</p>
                  <p className="text-[11px] text-neutral-600">
                    {show.document_numbers && documentPrints(cfg, guest.document_type) ? `${guest.document_type || "Document"}: ${formatDocumentNumber(guest.document_type, guest.document_number)}` : guest.document_type || "Document"}
                  </p>
                  {/* Fixed physical sizes (set under Settings): an ID card must stay legible however many guests share the page. */}
                  {show.id_photos
                    ? documentPhotos(guest).filter((_, photoIndex) => documentSidePrints(cfg, guest.document_type, photoIndex)).map((photo, photoIndex, all) => (
                        <div key={photoIndex} className="break-inside-avoid" style={{ marginTop: `calc(0.5rem + ${cfg.photo_gap_lines * LINE_MM}mm)` }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.data_url}
                            alt={`${guest.document_type} of ${guest.full_name}${all.length > 1 ? `, photo ${photoIndex + 1}` : ""}`}
                            className="block w-full shrink-0 rounded-sm border border-neutral-300 bg-white object-contain"
                            style={{ height: `${cfg.id_photo_height_mm}mm` }}
                          />
                        </div>
                      ))
                    : null}
                  {show.signatures && guest.signature_image?.data_url ? (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={guest.signature_image.data_url}
                        alt={`Signature of ${guest.full_name}`}
                        className="block w-full shrink-0 border-b border-neutral-400 bg-white object-contain object-left"
                        style={{ height: `${cfg.signature_height_mm}mm` }}
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

          {show.signatures && legacySignature ? (
            <div className="mt-3 max-w-[16rem] break-inside-avoid">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={legacySignature.data_url}
                alt={`Signature of ${booking.guest_name ?? "guest"}`}
                className="w-full border-b border-neutral-400 bg-white object-contain object-left"
                style={{ height: `${cfg.signature_height_mm}mm` }}
              />
              <p className="mt-0.5 text-[10px] text-neutral-600">Guest signature{checkinDate ? `, ${checkinDate}` : ""}</p>
            </div>
          ) : null}
          <Gap lines={cfg.spacers.after_verification} />
      </section>
      ) : null}

      <footer className="break-inside-avoid border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
        {show.terms && inv?.terms ? <p className="mb-1 whitespace-pre-line text-neutral-600">{inv.terms}</p> : null}
        {show.footer_note ? (
          <p>
            Generated by the property management system and reflects charges recorded at the time of issue. Thank you for
            staying with {issuer.name}.
          </p>
        ) : null}
      </footer>
    </article>
  );
}
