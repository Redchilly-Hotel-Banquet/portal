import { route } from "@/server/route";
import { menuService } from "@/server/modules/menu/menu.service";

export const POST = route(({ body }) => menuService.getMenu(body));
