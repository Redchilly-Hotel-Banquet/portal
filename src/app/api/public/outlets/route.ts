import { route } from "@/server/route";
import { outletService } from "@/server/modules/outlets/outlet.service";

export const dynamic = "force-dynamic";

export const GET = route(() => outletService.listPublic());
