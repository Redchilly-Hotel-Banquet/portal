/**
 * GST on a guest folio, as charged by the property (Uttar Pradesh, so the tax splits into CGST and SGST).
 *
 *   Room, tariff up to Rs 7,500 per night ........ 12%  (6% + 6%)
 *   Room, tariff above Rs 7,500 per night ........ 18%  (9% + 9%)
 *   Food and beverages, standard dining .......... 5%   (2.5% + 2.5%)
 *   Food and beverages, rooms above Rs 7,500 ..... 18%  (9% + 9%)
 *
 * Amounts held on the booking are before tax; GST is added on top. The tariff is per room per night.
 */
export const GST_TARIFF_THRESHOLD = 7500;

export type GstLine = {
  kind: "ROOM" | "FOOD";
  description: string;
  taxable: number;
  /** Total GST rate in percent; CGST and SGST are each half. */
  rate: number;
  cgst: number;
  sgst: number;
  /** Room tariff per room per night that decided the rate. For food, the highest room tariff on the stay. */
  tariff: number;
};

export type GstSummary = {
  lines: GstLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  gst: number;
  roundOff: number;
  /** What the guest pays: taxable + GST, rounded to the nearest rupee. */
  total: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const roomGstRate = (nightlyTariff: number) => (nightlyTariff > GST_TARIFF_THRESHOLD ? 18 : 12);
export const foodGstRate = (highestNightlyTariff: number) => (highestNightlyTariff > GST_TARIFF_THRESHOLD ? 18 : 5);

const line = (kind: GstLine["kind"], description: string, amount: number, rate: number, tariff: number): GstLine => {
  const taxable = money(amount);
  const half = money((taxable * rate) / 200);
  return { kind, description, taxable, rate, cgst: half, sgst: half, tariff: money(tariff) };
};

type RoomLine = { amount: number; tariff: number };

export const computeGst = (input: {
  roomTotal: number;
  foodTotal: number;
  nights: number;
  /** Priced room lines, when the booking has them. Their mix of tariffs decides the room rates. */
  roomLines: RoomLine[];
  /** Rooms the stay holds, used to find the average tariff when there are no priced lines. */
  roomCount: number;
}): GstSummary => {
  const nights = Math.max(input.nights, 1);
  const roomTotal = Math.max(input.roomTotal, 0);
  const foodTotal = Math.max(input.foodTotal, 0);

  // Room amounts by tariff band. A negotiated room total is spread over the lines in proportion.
  const priced = input.roomLines.filter((entry) => entry.amount > 0);
  const pricedSum = priced.reduce((sum, entry) => sum + entry.amount, 0);
  const bands: RoomLine[] =
    pricedSum > 0
      ? priced.map((entry) => ({
          amount: (entry.amount * roomTotal) / pricedSum,
          tariff: entry.tariff > 0 ? entry.tariff : entry.amount / nights,
        }))
      : [{ amount: roomTotal, tariff: roomTotal / (nights * Math.max(input.roomCount, 1)) }];

  // Amount and amount-weighted tariff per rate band.
  const byRate = new Map<number, { amount: number; weighted: number }>();
  for (const band of bands) {
    const rate = roomGstRate(band.tariff);
    const entry = byRate.get(rate) ?? { amount: 0, weighted: 0 };
    entry.amount += band.amount;
    entry.weighted += band.amount * band.tariff;
    byRate.set(rate, entry);
  }

  const lines: GstLine[] = [];
  for (const [rate, entry] of Array.from(byRate).sort((a, b) => a[0] - b[0])) {
    if (entry.amount > 0) lines.push(line("ROOM", "Room charges", entry.amount, rate, entry.weighted / entry.amount));
  }
  if (foodTotal > 0) {
    const highest = Math.max(...bands.map((band) => band.tariff), 0);
    lines.push(line("FOOD", "Food and beverages", foodTotal, foodGstRate(highest), highest));
  }

  const taxable = money(lines.reduce((sum, entry) => sum + entry.taxable, 0));
  const cgst = money(lines.reduce((sum, entry) => sum + entry.cgst, 0));
  const sgst = money(lines.reduce((sum, entry) => sum + entry.sgst, 0));
  const exact = money(taxable + cgst + sgst);
  const total = Math.round(exact);
  return { lines, taxable, cgst, sgst, gst: money(cgst + sgst), roundOff: money(total - exact), total };
};
