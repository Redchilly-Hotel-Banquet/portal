import { NextResponse } from "next/server";
import { isGoogleAuthEnabled } from "@/server/env";

export const dynamic = "force-dynamic";

export const GET = () => NextResponse.json({ google: isGoogleAuthEnabled() });
