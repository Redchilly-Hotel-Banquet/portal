import { route } from "@/server/route";
import { HttpError } from "@/server/httpError";
import { pushEnabled, registerPushToken, unregisterPushToken } from "@/server/push/fcm";

// A kitchen or admin phone tells the server where to send its new-order notifications.
export const POST = route(
  async ({ body, user }) => {
    const request = (body ?? {}) as { action?: string; token?: unknown };
    const token = typeof request.token === "string" ? request.token.trim() : "";
    if (request.action === "unregister") {
      if (token) await unregisterPushToken(token, user!.id);
      return { ok: true };
    }
    if (request.action !== "register" || token.length < 20 || token.length > 4096) throw new HttpError(400, "A valid action and token are required.");
    // `enabled` tells the phone whether the server can really send pushes; if not it keeps watching for orders itself.
    if (pushEnabled()) await registerPushToken(token, { id: user!.id, roles: user!.roles, outlets: user!.outlets });
    return { ok: true, enabled: pushEnabled() };
  },
  { roles: ["admin", "kitchen"] },
);
