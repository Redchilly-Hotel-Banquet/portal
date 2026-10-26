import { route } from "@/server/route";
import { menuAdminService } from "@/server/modules/menu/menu-admin.service";

export const POST = route(({ body, user }) => menuAdminService.manage(body, user!), { roles: ["admin", "kitchen"] });
