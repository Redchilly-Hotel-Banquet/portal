import { route } from "@/server/route";
import { bookingService } from "@/server/modules/bookings/booking.service";

// When the guest is signed in, the booking is linked to their account (user_id comes from the session).
export const POST = route(({ body, user }) => bookingService.createPublic(body, user?.src === "user" ? user.id : null, Boolean(user?.roles?.some((role) => role === "admin" || role === "rooms"))), {
  optionalAuth: true,
});
