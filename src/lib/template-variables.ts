/**
 * Variables the business defines once and uses in the WhatsApp message as {key}, for example {breakfast_time} or
 * {helpdesk}. A variable covers some branches, or every branch (`outlets` empty, including branches added later).
 * Where a branch is covered by both a specific variable and an every-branch one with the same key, the specific one wins.
 */
export type TemplateVariable = { key: string; value: string; outlets: string[] };

/** Built in, filled from the booking and the branch; a custom variable cannot take these names. */
export const RESERVED_TEMPLATE_KEYS = ["guest", "hotel", "hotel_key", "room", "checkin_id", "wifi", "note", "checkin_time", "checkout_time"] as const;

export const MAX_TEMPLATE_VARIABLES = 100;
export const MAX_VARIABLE_VALUE = 1000;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

export const isValidVariableKey = (key: string): boolean => KEY.test(key);

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Cleans whatever was stored or sent; invalid rows are dropped here, and `templateVariableError` explains them. */
export const normaliseTemplateVariables = (value: unknown): TemplateVariable[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_TEMPLATE_VARIABLES).map((row) => {
    const source = (row ?? {}) as Record<string, unknown>;
    return {
      key: text(source.key).trim().toLowerCase(),
      value: text(source.value).slice(0, MAX_VARIABLE_VALUE),
      outlets: Array.from(new Set(Array.isArray(source.outlets) ? source.outlets.map((o) => text(o).trim()).filter(Boolean) : [])),
    };
  });
};

/** The first problem with a list of variables, or null when it can be saved. */
export const templateVariableError = (variables: TemplateVariable[], knownOutlets?: string[]): string | null => {
  for (const variable of variables) {
    if (!isValidVariableKey(variable.key)) {
      return `"${variable.key || "(blank)"}" is not a valid name. Use lowercase letters, numbers and underscores, starting with a letter (for example breakfast_time).`;
    }
    if ((RESERVED_TEMPLATE_KEYS as readonly string[]).includes(variable.key)) return `{${variable.key}} is built in. Choose another name.`;
    if (!variable.value.trim()) return `{${variable.key}} needs a value.`;
    const unknown = knownOutlets ? variable.outlets.find((o) => !knownOutlets.includes(o)) : undefined;
    if (unknown) return `{${variable.key}} names a branch that does not exist (${unknown}).`;
  }
  const byKey = new Map<string, TemplateVariable[]>();
  for (const variable of variables) byKey.set(variable.key, [...(byKey.get(variable.key) ?? []), variable]);
  for (const [key, group] of byKey) {
    if (group.filter((v) => v.outlets.length === 0).length > 1) return `{${key}} is set for every branch more than once.`;
    const seen = new Set<string>();
    for (const variable of group) {
      for (const outlet of variable.outlets) {
        if (seen.has(outlet)) return `{${key}} is set twice for the same branch (${outlet}).`;
        seen.add(outlet);
      }
    }
  }
  return null;
};

/** The variables a branch uses, by key. */
export const variablesForOutlet = (variables: TemplateVariable[], outletKey: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const variable of variables) if (variable.outlets.length === 0) out[variable.key] = variable.value;
  for (const variable of variables) if (variable.outlets.includes(outletKey)) out[variable.key] = variable.value;
  return out;
};
