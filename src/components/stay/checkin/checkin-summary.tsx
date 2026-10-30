import { formatDate } from "@/components/admin/format";
import { StatusBadge } from "@/components/admin/status-badge";
import type { CheckinBooking, CheckinDetails } from "./types";

export function CheckinSummary({ booking, details }: { booking: CheckinBooking | null; details: CheckinDetails | null }) {
  const rooms = details?.assigned_rooms?.length ? details.assigned_rooms : details?.assigned_room ? [details.assigned_room] : [];

  return (
    <aside aria-label="Reservation summary" className="border border-border bg-card p-5 lg:sticky lg:top-24">
      <p className="eyebrow">Reservation</p>
      {!booking ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Your reservation details appear here once the booking is found.
        </p>
      ) : (
        <>
          <h2 className="mt-2 text-xl">{booking.guest_name}</h2>
          <p className="mt-1 font-mono text-sm tracking-wider text-muted-foreground">{booking.booking_code}</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Arrival</dt>
              <dd className="tabular-nums">{formatDate(booking.check_in_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Departure</dt>
              <dd className="tabular-nums">{formatDate(booking.check_out_date)}</dd>
            </div>
            {booking.number_of_guests ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Guests</dt>
                <dd className="tabular-nums">{booking.number_of_guests}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Booking</dt>
              <dd>
                <StatusBadge status={booking.status ?? "CONFIRMED"} />
              </dd>
            </div>
            {details?.status && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Check-in form</dt>
                <dd>
                  <StatusBadge status={details.status} />
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-5 border-t border-border pt-4 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Room</p>
            {rooms.length === 0 ? (
              <p className="mt-2 text-muted-foreground">Allotted at the front desk on arrival, once documents are verified.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {rooms.map((room, index) => (
                  <li key={room.id ?? index}>
                    <span className="tabular-nums">{room.code ?? "To be confirmed"}</span>
                    {room.type && <span className="text-muted-foreground"> · {room.type}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
