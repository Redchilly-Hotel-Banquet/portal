import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { normaliseCheckinRules, type CheckinRules } from "../../../lib/checkin-rules";

const COLLECTION = "app_config";
const CHECKIN_KEY = "checkin_rules";

type ConfigRequest = { action?: "get" | "update_checkin_rules"; checkin_rules?: unknown };

/** Business-wide settings that are not tied to one branch. */
export const configService = {
  async getCheckinRules(): Promise<CheckinRules> {
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: CHECKIN_KEY as any });
    return normaliseCheckinRules(doc?.rules);
  },

  async handle(request: ConfigRequest, user: AuthenticatedUser) {
    if (request?.action === "update_checkin_rules") {
      if (!user.roles.includes("admin")) throw new HttpError(403, "Only an administrator can change these settings.");
      const rules = normaliseCheckinRules(request.checkin_rules);
      await mongoConnection
        .getDb()
        .collection(COLLECTION)
        .updateOne({ _id: CHECKIN_KEY as any }, { $set: { rules, updated_at: new Date(), updated_by: user.id } }, { upsert: true });
      return { checkin_rules: rules };
    }
    return { checkin_rules: await this.getCheckinRules() };
  },
};
