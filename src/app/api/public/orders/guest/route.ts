import { route } from "@/server/route";
import { orderService } from "@/server/modules/orders/order.service";

export const POST = route(({ body, user }) => orderService.getGuestOrders(body, user), { optionalAuth: true });
