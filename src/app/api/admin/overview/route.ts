import { route } from "@/server/route";
import { analyticsService } from "@/server/modules/analytics/analytics.service";

// The dashboard cards, for every staff role. Only the branches the account was given are counted.
export const POST = route(({ user }) => analyticsService.getOverview(user!), {
  roles: ["admin", "rooms", "kitchen"],
});
