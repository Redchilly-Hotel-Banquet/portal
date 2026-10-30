export type GuestInsight = {
  key: string;
  name: string;
  phone: string;
  email: string;
  bookings: number;
  nights: number;
  room_types: Record<string, number>;
  room_spend: number;
  food_spend: number;
  food_orders: number;
  total_spend: number;
  payments: Record<string, number>;
  last_booking: string | null;
};

export type GuestsInsights = {
  total_guests: number;
  repeat_guests: number;
  guests: GuestInsight[];
};

export type TrendsInsights = {
  from: string;
  to: string;
  /** Points are per day for short ranges, per month for long ones. */
  unit: "day" | "month";
  totals: { bookings: number; room_income: number; food_orders: number; food_income: number; income: number; busiest: string | null };
  series: Array<{ bucket: string; bookings: number; room_income: number; food_orders: number; food_income: number }>;
  room_types: Array<{ type: string; bookings: number; income: number }>;
  top_items: Array<{ name: string; category: string; quantity: number; sales: number }>;
  food_categories: Array<{ category: string; sales: number }>;
  payments: Array<{ mode: string; amount: number }>;
  branches: Array<{ outlet_id: string; outlet_name: string; bookings: number; room_income: number; food_orders: number; food_income: number }>;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-07" -> "7 Mar", "2026-03" -> "Mar 2026". */
export const bucketLabel = (bucket: string): string => {
  const [year, month, day] = bucket.split("-");
  const name = MONTHS[Number(month) - 1] ?? bucket;
  return day ? `${Number(day)} ${name}` : `${name} ${year}`;
};

/** Current year and the four before it, newest first. */
export const yearOptions = (): number[] => {
  const current = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => current - i);
};
