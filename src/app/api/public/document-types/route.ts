import { route } from "@/server/route";
import { configService } from "@/server/modules/config/config.service";

export const dynamic = "force-dynamic";

// The check-in forms (guest and reception) read which documents are accepted and how many photos each needs.
export const GET = route(async () => ({ document_types: await configService.getDocumentTypes() }));
