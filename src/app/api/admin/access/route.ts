import { route } from "@/server/route";
import { accessService } from "@/server/modules/access/access.service";

export const POST = route(({ body, user }) => accessService.handle(body, user!), { roles: ["admin"] });
