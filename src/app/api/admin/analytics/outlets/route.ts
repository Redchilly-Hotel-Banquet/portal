import { route } from "@/server/route";
import { analyticsService } from "@/server/modules/analytics/analytics.service";

export const POST = route(({ user }) => analyticsService.getOutletAnalytics(user!), {
  roles: ["admin"],
});
