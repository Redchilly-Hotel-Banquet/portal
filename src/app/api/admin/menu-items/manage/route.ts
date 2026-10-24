import { route } from "@/server/route";
import { menuAdminService } from "@/server/modules/menu/menu-admin.service";

export const POST = route(({ body }) => menuAdminService.manage(body), { roles: ["admin", "kitchen"] });
