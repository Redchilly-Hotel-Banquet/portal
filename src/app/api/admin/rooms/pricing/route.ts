import { route } from "@/server/route";
import { roomService } from "@/server/modules/rooms/room.service";

export const POST = route(({ body, user }) => roomService.managePricing(body, user!), {
  roles: ["admin", "rooms"],
});
