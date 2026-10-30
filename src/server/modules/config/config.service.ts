import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { checkinRuleSetsError, normaliseCheckinRules, normaliseCheckinRuleSets, rulesForOutlet, type CheckinRules, type CheckinRuleSet } from "../../../lib/checkin-rules";
import { normaliseTemplateVariables, templateVariableError, type TemplateVariable } from "../../../lib/template-variables";

const COLLECTION = "app_config";
const CHECKIN_KEY = "checkin_rules";
const VARIABLES_KEY = "template_variables";

type ConfigRequest = {
  action?: "get" | "update_checkin_rules" | "update_template_variables";
  checkin_rule_sets?: unknown;
  template_variables?: unknown;
};

/** Business-wide settings that are not tied to one branch. */
export const configService = {
  async getCheckinRuleSets(): Promise<CheckinRuleSet[]> {
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: CHECKIN_KEY as any });
    if (Array.isArray(doc?.sets)) return normaliseCheckinRuleSets(doc.sets);
    // Saved before rules were per branch: the one set of rules covered every branch.
    return doc?.rules ? [{ outlets: [], rules: normaliseCheckinRules(doc.rules) }] : [];
  },

  /** The rules reception follows for a branch (its location key). */
  async getCheckinRules(outletKey?: string | null): Promise<CheckinRules> {
    return rulesForOutlet(await this.getCheckinRuleSets(), outletKey);
  },

  async getTemplateVariables(): Promise<TemplateVariable[]> {
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: VARIABLES_KEY as any });
    return normaliseTemplateVariables(doc?.variables);
  },

  async handle(request: ConfigRequest, user: AuthenticatedUser) {
    if (request?.action === "update_checkin_rules") {
      if (!user.roles.includes("admin")) throw new HttpError(403, "Only an administrator can change these settings.");
      // Rule sets span branches, so only an all-branch administrator edits them.
      if (!user.outlets.includes("all")) throw new HttpError(403, "Only an all-branch administrator can change the check-in rules.");
      const sets = normaliseCheckinRuleSets(request.checkin_rule_sets);
      const branches = await mongoConnection.getDb().collection("outlets").find({}).project({ location_key: 1 }).toArray();
      const problem = checkinRuleSetsError(sets, branches.map((b: any) => String(b.location_key)));
      if (problem) throw new HttpError(400, problem);
      await mongoConnection
        .getDb()
        .collection(COLLECTION)
        .updateOne({ _id: CHECKIN_KEY as any }, { $set: { sets, updated_at: new Date(), updated_by: user.id }, $unset: { rules: "" } }, { upsert: true });
      return { checkin_rule_sets: sets };
    }
    if (request?.action === "update_template_variables") {
      if (!user.roles.includes("admin")) throw new HttpError(403, "Only an administrator can change these settings.");
      // Variables are shared across branches, so only an all-branch administrator edits them.
      if (!user.outlets.includes("all")) throw new HttpError(403, "Only an all-branch administrator can change message variables.");
      const variables = normaliseTemplateVariables(request.template_variables);
      const branches = await mongoConnection.getDb().collection("outlets").find({}).project({ location_key: 1 }).toArray();
      const problem = templateVariableError(variables, branches.map((b: any) => String(b.location_key)));
      if (problem) throw new HttpError(400, problem);
      await mongoConnection
        .getDb()
        .collection(COLLECTION)
        .updateOne({ _id: VARIABLES_KEY as any }, { $set: { variables, updated_at: new Date(), updated_by: user.id } }, { upsert: true });
      return { template_variables: variables };
    }
    return { checkin_rule_sets: await this.getCheckinRuleSets(), template_variables: await this.getTemplateVariables() };
  },
};
