import type { ObjectId } from "mongodb";
import { outletDirectory, outletKeyOf } from "../../utils/outlets";
import { toObjectId } from "../../utils/objectId";
import { InvoiceSettings, InvoiceSettingSet, invoiceSetsError, invoiceSettingsForOutlet, normaliseInvoiceSets } from "../../../lib/invoice-settings";
import { DocumentTypeConfig, documentTypesError, normaliseDocumentTypes } from "../../../lib/document-types";
import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { checkinRuleSetsError, normaliseCheckinRules, normaliseCheckinRuleSets, rulesForOutlet, type CheckinRules, type CheckinRuleSet } from "../../../lib/checkin-rules";
import { normaliseTemplateVariables, templateVariableError, type TemplateVariable } from "../../../lib/template-variables";

const COLLECTION = "app_config";
const CHECKIN_KEY = "checkin_rules";
const VARIABLES_KEY = "template_variables";
const DOCUMENTS_KEY = "document_types";
const INVOICE_KEY = "invoice_settings";

type ConfigRequest = {
  action?: "get" | "update_checkin_rules" | "update_template_variables" | "update_document_types" | "update_invoice_settings";
  document_types?: unknown;
  invoice_setting_sets?: unknown;
  checkin_rule_sets?: unknown;
  template_variables?: unknown;
};

/** Branch lists in these settings are stored as branch ids and shown to the screens as branch keys. */
const asKeys = (list: unknown): string[] => (Array.isArray(list) ? list.map((entry) => outletKeyOf(entry) ?? String(entry)) : []);
const asIds = (keys: string[]): ObjectId[] => outletDirectory.idsOf(keys);

/** Business-wide settings that are not tied to one branch. */
export const configService = {
  async getCheckinRuleSets(): Promise<CheckinRuleSet[]> {
    await outletDirectory.load();
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: CHECKIN_KEY as any });
    if (Array.isArray(doc?.sets)) return normaliseCheckinRuleSets(doc.sets.map((set: any) => ({ ...set, outlets: asKeys(set?.outlets) })));
    // Saved before rules were per branch: the one set of rules covered every branch.
    return doc?.rules ? [{ outlets: [], rules: normaliseCheckinRules(doc.rules) }] : [];
  },

  /** The rules reception follows for a branch (its location key). */
  async getCheckinRules(outletKey?: string | null): Promise<CheckinRules> {
    return rulesForOutlet(await this.getCheckinRuleSets(), outletKey);
  },

  /** What the printed invoice shows, per branch. Stored with branch ids, shown with branch keys. */
  async getInvoiceSettingSets(): Promise<InvoiceSettingSet[]> {
    await outletDirectory.load();
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: INVOICE_KEY as any });
    return normaliseInvoiceSets(Array.isArray(doc?.sets) ? doc.sets.map((set: any) => ({ ...set, outlets: asKeys(set?.outlets) })) : []);
  },

  /** The invoice settings for a branch (its location key). */
  async getInvoiceSettings(outletKey?: string | null): Promise<InvoiceSettings> {
    return invoiceSettingsForOutlet(await this.getInvoiceSettingSets(), outletKey);
  },

  /** The identity documents guests can give and how many photos each needs. */
  async getDocumentTypes(): Promise<DocumentTypeConfig[]> {
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: DOCUMENTS_KEY as any });
    return normaliseDocumentTypes(doc?.types);
  },

  async getTemplateVariables(): Promise<TemplateVariable[]> {
    await outletDirectory.load();
    const doc = await mongoConnection.getDb().collection(COLLECTION).findOne({ _id: VARIABLES_KEY as any });
    return normaliseTemplateVariables(Array.isArray(doc?.variables) ? doc.variables.map((variable: any) => ({ ...variable, outlets: asKeys(variable?.outlets) })) : doc?.variables);
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
        .updateOne({ _id: CHECKIN_KEY as any }, { $set: { sets: sets.map((set) => ({ ...set, outlets: asIds(set.outlets) })), updated_at: new Date(), updated_by: toObjectId(user.id) ?? user.id }, $unset: { rules: "" } }, { upsert: true });
      return { checkin_rule_sets: sets };
    }
    if (request?.action === "update_invoice_settings") {
      if (!user.roles.includes("admin")) throw new HttpError(403, "Only an administrator can change these settings.");
      if (!user.outlets.includes("all")) throw new HttpError(403, "Only an all-branch administrator can change the invoice settings.");
      const sets = normaliseInvoiceSets(request.invoice_setting_sets);
      await outletDirectory.load();
      const problem = invoiceSetsError(sets, outletDirectory.allKeys());
      if (problem) throw new HttpError(400, problem);
      await mongoConnection
        .getDb()
        .collection(COLLECTION)
        .updateOne({ _id: INVOICE_KEY as any }, { $set: { sets: sets.map((set) => ({ ...set, outlets: asIds(set.outlets) })), updated_at: new Date(), updated_by: toObjectId(user.id) ?? user.id } }, { upsert: true });
      return { invoice_setting_sets: sets };
    }
    if (request?.action === "update_document_types") {
      if (!user.roles.includes("admin")) throw new HttpError(403, "Only an administrator can change these settings.");
      if (!user.outlets.includes("all")) throw new HttpError(403, "Only an all-branch administrator can change the document types.");
      const problem = documentTypesError(request.document_types);
      if (problem) throw new HttpError(400, problem);
      const types = normaliseDocumentTypes(request.document_types);
      await mongoConnection
        .getDb()
        .collection(COLLECTION)
        .updateOne({ _id: DOCUMENTS_KEY as any }, { $set: { types, updated_at: new Date(), updated_by: toObjectId(user.id) ?? user.id } }, { upsert: true });
      return { document_types: types };
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
        .updateOne({ _id: VARIABLES_KEY as any }, { $set: { variables: variables.map((variable) => ({ ...variable, outlets: asIds(variable.outlets) })), updated_at: new Date(), updated_by: toObjectId(user.id) ?? user.id } }, { upsert: true });
      return { template_variables: variables };
    }
    return { checkin_rule_sets: await this.getCheckinRuleSets(), template_variables: await this.getTemplateVariables(), document_types: await this.getDocumentTypes(), invoice_setting_sets: await this.getInvoiceSettingSets() };
  },
};
