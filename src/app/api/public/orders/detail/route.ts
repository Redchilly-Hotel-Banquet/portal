import { route } from "@/server/route";
import { orderService } from "@/server/modules/orders/order.service";

export const POST = route(({ body, user }) => orderService.getOrder(body, user), { optionalAuth: true });
