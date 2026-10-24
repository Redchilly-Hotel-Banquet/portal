import { route } from "@/server/route";
import { bookingService } from "@/server/modules/bookings/booking.service";

// Guests are never privileged here. A signed-in owner may open their own booking without the last name.
export const POST = route(
  ({ body, user }) =>
    bookingService.checkin(body, null, user?.src === "user" ? { id: user.id, email: user.email } : null),
  { optionalAuth: true },
);
