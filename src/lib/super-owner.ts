/** The one account that may switch into any other account. The server checks this too; the page only uses it to show the control. */
export const SUPER_OWNER_EMAIL = "thesatemail@gmail.com";

export const isSuperOwnerEmail = (email: unknown): boolean => String(email ?? "").trim().toLowerCase() === SUPER_OWNER_EMAIL;
