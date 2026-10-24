import { route } from "@/server/route";
import { roomService } from "@/server/modules/rooms/room.service";

export const POST = route(({ body }) => roomService.getAvailability(body));
