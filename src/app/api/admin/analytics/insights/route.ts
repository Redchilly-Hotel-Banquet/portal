import { route } from "@/server/route";
import { insightsService } from "@/server/modules/analytics/insights.service";

export const POST = route(({ body, user }) => insightsService.get(user!, body), {
  roles: ["admin"],
});
