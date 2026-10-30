import { route } from "@/server/route";
import { reportService } from "@/server/modules/analytics/report.service";

// Reports are built after the response is sent, so the function needs time to finish them.
export const maxDuration = 60;

export const POST = route(({ body, user }) => reportService.handle(body, user!), { roles: ["admin"] });
