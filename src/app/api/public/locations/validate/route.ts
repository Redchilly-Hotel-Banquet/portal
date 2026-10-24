import { route } from "@/server/route";
import { locationService } from "@/server/modules/locations/location.service";

export const POST = route(({ body }) => locationService.validate(body));
