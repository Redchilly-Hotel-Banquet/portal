import { route } from "@/server/route";
import { phoneOrderService } from "@/server/modules/orders/phone-order.service";

// Reception ("rooms") and the kitchen both take food orders over the phone.
export const POST = route(({ body, user }) => phoneOrderService.handle(body, user!), {
  roles: ["admin", "kitchen", "rooms"],
});
