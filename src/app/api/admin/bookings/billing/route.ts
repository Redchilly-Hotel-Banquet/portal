import { route } from "@/server/route";
import { bookingService } from "@/server/modules/bookings/booking.service";

export const POST = route(({ body, user }) => bookingService.billing(body, user!), {
  roles: ["admin", "rooms"],
});
