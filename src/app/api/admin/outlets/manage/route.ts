import { route } from "@/server/route";
import { outletService } from "@/server/modules/outlets/outlet.service";

export const POST = route(({ body, user }) => outletService.manage(body, user!), { roles: ["admin"] });
