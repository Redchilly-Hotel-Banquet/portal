import { route } from "@/server/route";
import { analyticsService } from "@/server/modules/analytics/analytics.service";

export const POST = route(({ body, user }) => analyticsService.getOutletAnalytics(user!, body), {
  roles: ["admin"],
});
