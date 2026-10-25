/** How a guest paid at check-out. Shared by the checkout form, the API and analytics. */
export const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card (debit or credit)" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "COMPANY", label: "Company billing (credit)" },
  { value: "OTHER", label: "Other" },
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number]["value"];

export const PAYMENT_MODE_VALUES: readonly string[] = PAYMENT_MODES.map((mode) => mode.value);

export const paymentModeLabel = (value: string): string =>
  PAYMENT_MODES.find((mode) => mode.value === value)?.label ?? value;

export type PaymentLine = { mode: string; amount: number; reference?: string | null };
