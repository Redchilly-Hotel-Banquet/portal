import { route } from "@/server/route";
import { configService } from "@/server/modules/config/config.service";

// Reception reads the rules to build the check-in form; only administrators change them.
export const POST = route(({ body, user }) => configService.handle(body, user!), { roles: ["admin", "rooms"] });
