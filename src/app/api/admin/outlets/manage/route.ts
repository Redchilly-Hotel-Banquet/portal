import { route } from "@/server/route";
import { outletService } from "@/server/modules/outlets/outlet.service";

export const POST = route(({ body }) => outletService.manage(body), { roles: ["admin"] });
