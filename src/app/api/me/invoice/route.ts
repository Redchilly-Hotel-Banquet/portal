import { route } from "@/server/route";
import { HttpError } from "@/server/httpError";
import { bookingService } from "@/server/modules/bookings/booking.service";

export const dynamic = "force-dynamic";

/** The signed-in owner's invoice for a booking that has been checked out. */
export const POST = route(
  ({ body, user }) => {
    // Password-based staff sessions have no guest account, hence no bookings of their own.
    if (user?.src !== "user") throw new HttpError(403, "Sign in with your guest account to view your invoices");
    return bookingService.invoiceForOwner(body, { id: user.id, email: user.email });
  },
  { authenticated: true },
);
