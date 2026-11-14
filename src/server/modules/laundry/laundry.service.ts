import { ObjectId } from "mongodb";
import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { assertAdmin, assertOutlet, outletFilter } from "../../utils/access";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { outletDirectory, outletKeyOf } from "../../utils/outlets";

/**
 * Laundry sent out and received back.
 *
 * A batch is one day's laundry given to the laundry: each line is an item with the price it had that day and how many
 * were sent. Receipts are added on the days the laundry comes back (it can come back in parts). What is still out is
 * "missing" and stays on record, also after the batch is settled. Settling works out what is owed for what actually
 * came back, with an optional adjustment for each item and overall.
 *
 * Prices are dated. An item has a price history: each price applies from a date. A batch is priced at the rate in effect
 * on the day it was given, so 10 bed sheets at 7 on Monday and 5 at 10 on Tuesday come to 70 + 50 = 120 for the period.
 * A price change takes effect from today by default; the effective date can be set earlier, which re-prices the batches
 * that are not settled yet from that date on. Settling freezes the prices on the batch, so a settled record never changes.
 * The price a batch was recorded with is the fallback for a date before any price on record.
 *
 * When to settle: an administrator can limit settling to the 1st or the last day of each month, or a day of the month.
 * With that switched off, a batch can be settled on any day.
 */
type Doc = Record<string, any>;

const ITEMS = "laundry_items";
const BATCHES = "laundry_batches";
const SETTINGS = "laundry_settings";
const VENDORS = "laundry_vendors";
const SETTLEMENTS = "laundry_settlements";
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const MAX_QTY = 100000;

const db = () => mongoConnection.getDb();

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

const wholeNumber = (value: unknown, label: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_QTY) throw new HttpError(400, `${label} must be a whole number from 0 to ${MAX_QTY}.`);
  return n;
};

const amount = (value: unknown, label: string): number => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, `${label} must be an amount of zero or more.`);
  return money(n);
};

const dayOf = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new HttpError(400, "Choose a valid date.");
  if (date.getTime() > Date.now() + 2 * 86400000) throw new HttpError(400, "The date cannot be in the future.");
  return raw;
};

const who = (user: AuthenticatedUser) => ({ id: toObjectId(user.id) ?? user.id, name: user.name });

/** Adds up what was sent and received for each line, and what each is worth at the day's price. */
type PricePoint = { price: number; from: string };
type Prices = Map<string, PricePoint[]>;
const BEGINNING = "1970-01-01";

/** The price in effect on a day: the latest price that starts on or before it. */
const priceOn = (history: PricePoint[] | undefined, date: string): number | undefined => {
  let found: PricePoint | undefined;
  for (const point of history ?? []) if (point.from <= date && (!found || point.from >= found.from)) found = point;
  return found?.price;
};

const present = (batch: Doc, prices?: Prices) => {
  const received = new Map<string, number>();
  for (const receipt of batch.receipts ?? []) for (const line of receipt.lines ?? []) received.set(String(line.item_id), (received.get(String(line.item_id)) ?? 0) + Number(line.qty || 0));
  const lines = (batch.lines ?? []).map((line: Doc) => {
    const got = received.get(String(line.item_id)) ?? 0;
    const sent = Number(line.sent_qty);
    // An open batch is priced at the rate in effect on its date; a settled one keeps the price it was frozen at.
    const dated = !batch.settlement ? priceOn(prices?.get(String(line.item_id)), batch.date) : undefined;
    const price = dated ?? Number(line.unit_price);
    return {
      item_id: stringifyId(line.item_id),
      name: line.name,
      unit_price: price,
      sent_qty: sent,
      received_qty: got,
      missing_qty: Math.max(sent - got, 0),
      sent_amount: money(sent * price),
      received_amount: money(got * price),
      missing_amount: money(Math.max(sent - got, 0) * price),
    };
  });
  const sum = (key: string) => money(lines.reduce((total: number, line: Doc) => total + line[key], 0));
  const totals = {
    sent_qty: lines.reduce((n: number, l: Doc) => n + l.sent_qty, 0),
    received_qty: lines.reduce((n: number, l: Doc) => n + l.received_qty, 0),
    missing_qty: lines.reduce((n: number, l: Doc) => n + l.missing_qty, 0),
    sent_amount: sum("sent_amount"),
    received_amount: sum("received_amount"),
    missing_amount: sum("missing_amount"),
  };
  const status = batch.settlement ? "SETTLED" : totals.received_qty === 0 ? "SENT" : totals.missing_qty === 0 ? "RECEIVED" : "PARTIAL";
  return {
    id: stringifyId(batch._id),
    outlet_id: outletKeyOf(batch.outlet_id),
    date: batch.date,
    vendor: batch.vendor ?? "",
    notes: batch.notes ?? "",
    status,
    lines,
    totals,
    receipts: (batch.receipts ?? []).map((receipt: Doc) => ({
      id: stringifyId(receipt._id),
      date: receipt.date,
      at: receipt.at,
      by: receipt.by?.name ?? "",
      note: receipt.note ?? "",
      lines: (receipt.lines ?? []).map((line: Doc) => ({ item_id: stringifyId(line.item_id), name: (batch.lines ?? []).find((l: Doc) => String(l.item_id) === String(line.item_id))?.name ?? "", qty: line.qty })),
    })),
    settlement: batch.settlement
      ? { ...batch.settlement, by: batch.settlement.by?.name ?? "", items: (batch.settlement.items ?? []).map((item: Doc) => ({ ...item, item_id: stringifyId(item.item_id) })) }
      : null,
    created_at: batch.created_at,
    created_by: batch.created_by?.name ?? "",
  };
};

const itemOut = (doc: Doc) => ({ id: stringifyId(doc._id), name: doc.name, price: priceOn(pointsOf(doc), todayIst()) ?? doc.price, active: doc.active !== false, sort_order: doc.sort_order ?? 0, history: pointsOf(doc).sort((a, b) => b.from.localeCompare(a.from)) });

const pointsOf = (doc: Doc): PricePoint[] => (doc.price_history ?? []).filter((h: Doc) => typeof h.from === "string").map((h: Doc) => ({ price: Number(h.price), from: h.from }));
const livePrices = async (): Promise<Prices> => new Map((await db().collection(ITEMS).find({}, { projection: { price_history: 1 } }).toArray()).map((doc) => [String(doc._id), pointsOf(doc)]));

/* ---- settlement schedule ---- */
type Schedule = { restrict: boolean; rule: "FIRST" | "LAST" | "DAY"; day: number };
const DEFAULT_SCHEDULE: Schedule = { restrict: false, rule: "LAST", day: 1 };
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12

/** The settlement date in a month (a day past the month's end, such as the 31st in June, falls on the last day). */
const settleDayIn = (schedule: Schedule, year: number, month: number) => {
  const last = daysIn(year, month);
  const day = schedule.rule === "FIRST" ? 1 : schedule.rule === "LAST" ? last : Math.min(Math.max(schedule.day, 1), last);
  return `${year}-${pad(month)}-${pad(day)}`;
};

const describe = (schedule: Schedule) => (!schedule.restrict ? "any day" : schedule.rule === "FIRST" ? "the 1st of every month" : schedule.rule === "LAST" ? "the last day of every month" : `day ${schedule.day} of every month (the last day in shorter months)`);

/** Whether settling is allowed today (India time), and when it next is. */
const settlementWindow = (schedule: Schedule, today = todayIst()) => {
  if (!schedule.restrict) return { ...schedule, open: true, today, next_date: today, summary: describe(schedule) };
  const [year, month] = today.split("-").map(Number);
  const thisMonth = settleDayIn(schedule, year, month);
  const next = thisMonth >= today ? thisMonth : month === 12 ? settleDayIn(schedule, year + 1, 1) : settleDayIn(schedule, year, month + 1);
  return { ...schedule, open: thisMonth === today, today, next_date: next, summary: describe(schedule) };
};

const readSchedule = async (): Promise<Schedule> => {
  const saved = await db().collection(SETTINGS).findOne({ _id: "settlement" as any });
  return { ...DEFAULT_SCHEDULE, ...(saved ? { restrict: saved.restrict === true, rule: ["FIRST", "LAST", "DAY"].includes(saved.rule) ? saved.rule : "LAST", day: Number.isInteger(saved.day) ? saved.day : 1 } : {}) };
};

const loadBatch = async (id: unknown, user: AuthenticatedUser) => {
  const _id = toObjectId(id);
  const batch = _id ? await db().collection(BATCHES).findOne({ _id }) : null;
  if (!batch) throw new HttpError(404, "That laundry record was not found.");
  assertOutlet(user, batch.outlet_id);
  return batch;
};

type Request = {
  action?: string;
  id?: string;
  items?: Array<{ id?: string; name?: string; price?: unknown; active?: boolean }>;
  outlet_id?: string;
  date?: string;
  vendor?: string;
  notes?: string;
  lines?: Array<{ item_id?: string; qty?: unknown }>;
  note?: string;
  receipt_id?: string;
  adjustments?: Array<{ item_id?: string; amount?: unknown }>;
  adjustment?: unknown;
  vendors?: Array<{ id?: string; name?: string; active?: boolean }>;
  effective_from?: string;
  restrict?: boolean;
  rule?: string;
  day?: unknown;
  payment?: { mode?: string; reference?: string };
  status?: string;
  from?: string;
  to?: string;
};

export const laundryService = {
  async handle(request: Request, user: AuthenticatedUser) {
    await outletDirectory.load();
    switch (request?.action) {
      case "items":
        return { items: (await db().collection(ITEMS).find({}).sort({ sort_order: 1, name: 1 }).toArray()).map(itemOut) };
      case "items_save":
        return this.saveItems(request, user);
      case "settle_preview":
        return { draft: await this.draft(request, user, false) };
      case "settle_all":
        return this.settleAll(request, user);
      case "settlements":
        return this.settlements(request, user);
      case "stock":
        return this.stock(request, user);
      case "receive_items":
        return this.receiveItems(request, user);
      case "vendors":
        return { vendors: await this.vendorList() };
      case "vendors_save":
        return this.saveVendors(request, user);
      case "settings":
        return { window: settlementWindow(await readSchedule()) };
      case "settings_save":
        return this.saveSettings(request, user);
      case "demo_seed":
        return this.seedDemo(user);
      case "demo_clear":
        return this.clearDemo(user);
      case "list":
        return this.list(request, user);
      case "get":
        return { batch: present(await loadBatch(request.id, user), await livePrices()), window: settlementWindow(await readSchedule()) };
      case "create":
        return this.create(request, user);
      case "update":
        return this.update(request, user);
      case "delete":
        return this.remove(request, user);
      case "receive":
        return this.receive(request, user);
      case "undo_receipt":
        return this.undoReceipt(request, user);
      case "settle":
        return this.settle(request, user);
      case "missing":
        return this.missing(request, user);
      default:
        throw new HttpError(400, "Invalid action");
    }
  },

  /**
   * The list of things that can go to the laundry, with their prices. The laundry staff and administrators change it.
   * A changed price starts on `effective_from` (today unless given): laundry given from that day is priced at it, and
   * laundry given before it keeps the earlier price. An earlier date also re-prices unsettled laundry from that date on.
   */
  async saveItems(request: Request, user: AuthenticatedUser) {
    const collection = db().collection(ITEMS);
    const incoming = Array.isArray(request.items) ? request.items.slice(0, 200) : [];
    const today = todayIst();
    const from = request.effective_from ? String(request.effective_from) : today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(new Date(`${from}T00:00:00Z`).getTime())) throw new HttpError(400, "Choose a valid date for the new price.");
    if (from > new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10)) throw new HttpError(400, "The new price cannot start more than a year ahead.");
    const seen = new Set<string>();
    for (const [index, item] of incoming.entries()) {
      const name = text(item?.name, 80);
      if (!name) throw new HttpError(400, "Every item needs a name.");
      if (seen.has(name.toLowerCase())) throw new HttpError(400, `"${name}" is listed twice.`);
      seen.add(name.toLowerCase());
      const price = amount(item?.price, `The price of ${name}`);
      const id = toObjectId(item?.id);
      const fields = { name, active: item?.active !== false, sort_order: index, updated_at: new Date() };
      const stamp = { at: new Date(), by: who(user) };
      if (id) {
        const before = await collection.findOne({ _id: id });
        if (!before) continue;
        let history: Doc[] = pointsOf(before).map((h) => ({ ...h }));
        // An item from before dated prices starts its history with the price it has now.
        if (history.length === 0) history = [{ price: Number(before.price), from: BEGINNING }];
        const inEffect = priceOn(history as PricePoint[], from);
        if (inEffect !== price) history = [...history.filter((h) => h.from !== from), { price, from, ...stamp }];
        await collection.updateOne({ _id: id }, { $set: { ...fields, price_history: history, price: priceOn(history as PricePoint[], today) ?? price } });
      } else await collection.insertOne({ ...fields, price, price_history: [{ price, from: BEGINNING, ...stamp }], created_at: new Date() });
    }
    // An item left out of the list is switched off, not deleted: past laundry still refers to it.
    const keep = incoming.map((item) => toObjectId(item?.id)).filter((id): id is ObjectId => id !== null);
    await collection.updateMany({ _id: { $nin: keep }, name: { $nin: incoming.map((i) => text(i?.name, 80)) } }, { $set: { active: false } });
    return { items: (await collection.find({}).sort({ sort_order: 1, name: 1 }).toArray()).map(itemOut) };
  },

  /** The unsettled batches the user can see, oldest first, optionally for one branch or laundry. */
  async openBatches(request: Request, user: AuthenticatedUser) {
    const filter: Record<string, any> = { ...outletFilter(user), settlement: { $exists: false } };
    if (request.outlet_id) {
      const id = outletDirectory.idOf(request.outlet_id);
      if (!id) throw new HttpError(400, "Unknown branch");
      assertOutlet(user, id);
      filter.outlet_id = id;
    }
    if (request.vendor) filter.vendor = text(request.vendor, 80);
    const prices = await livePrices();
    return (await db().collection(BATCHES).find(filter).sort({ date: 1, created_at: 1 }).toArray()).map((doc) => ({ doc, view: present(doc, prices) }));
  },

  /** For each item: how many have been given to the laundry, how many came back, and what is still out, with the batches it is out in. */
  async stock(request: Request, user: AuthenticatedUser) {
    const items = new Map<string, Doc>();
    for (const { view } of await this.openBatches(request, user)) {
      for (const line of view.lines) {
        const row = items.get(line.item_id) ?? { item_id: line.item_id, name: line.name, sent_qty: 0, received_qty: 0, out_qty: 0, out_amount: 0, batches: [] };
        row.sent_qty += line.sent_qty; row.received_qty += line.received_qty; row.out_qty += line.missing_qty; row.out_amount = money(row.out_amount + line.missing_amount);
        if (line.missing_qty > 0) row.batches.push({ batch_id: view.id, date: view.date, vendor: view.vendor, rate: line.unit_price, out_qty: line.missing_qty });
        items.set(line.item_id, row);
      }
    }
    const rows = Array.from(items.values()).sort((a, b) => b.out_qty - a.out_qty || a.name.localeCompare(b.name));
    return { items: rows, totals: { sent_qty: rows.reduce((n, r) => n + r.sent_qty, 0), received_qty: rows.reduce((n, r) => n + r.received_qty, 0), out_qty: rows.reduce((n, r) => n + r.out_qty, 0), out_amount: money(rows.reduce((n, r) => n + r.out_amount, 0)) } };
  },

  /**
   * Records what came back, by item, without choosing a batch: each item's quantity is taken against the oldest
   * unsettled batches that still have it out, one receipt per batch touched.
   */
  async receiveItems(request: Request, user: AuthenticatedUser) {
    const date = dayOf(request.date);
    const wanted = new Map<string, number>();
    for (const line of Array.isArray(request.lines) ? request.lines : []) {
      const id = String(toObjectId(line?.item_id) ?? "");
      const qty = wholeNumber(line?.qty ?? 0, "A quantity");
      if (id && qty > 0) wanted.set(id, (wanted.get(id) ?? 0) + qty);
    }
    if (wanted.size === 0) throw new HttpError(400, "Enter how many of at least one item came back.");
    const batches = await this.openBatches(request, user);
    const plan = new Map<string, Array<{ item_id: ObjectId; qty: number }>>();
    for (const [itemId, qty] of wanted) {
      let left = qty;
      let name = "";
      let out = 0;
      for (const { view } of batches) { const line = view.lines.find((l: Doc) => l.item_id === itemId); if (line) { name = line.name; out += line.missing_qty; } }
      if (qty > out) throw new HttpError(400, `Only ${out} ${name || "of that item"} ${out === 1 ? "is" : "are"} still out, but ${qty} ${qty === 1 ? "was" : "were"} entered.`);
      for (const { doc, view } of batches) {
        const line = view.lines.find((l: Doc) => l.item_id === itemId);
        if (!line || line.missing_qty === 0 || left === 0) continue;
        const take = Math.min(left, line.missing_qty);
        left -= take;
        plan.set(String(doc._id), [...(plan.get(String(doc._id)) ?? []), { item_id: new ObjectId(itemId), qty: take }]);
      }
    }
    const note = text(request.note, 300);
    for (const [batchId, lines] of plan) {
      const receipt = { _id: new ObjectId(), date, at: new Date(), by: who(user), note, lines };
      await db().collection(BATCHES).updateOne({ _id: new ObjectId(batchId), settlement: { $exists: false } }, { $push: { receipts: receipt } as any, $set: { updated_at: new Date() } });
    }
    return { ...(await this.stock(request, user)), batches_updated: plan.size };
  },

  /**
   * What an overall settlement would cover: every unsettled batch (of the chosen laundry / branch) that has something
   * back, added up by item. Each batch contributes at the prices of its own day. With `check`, the request's reductions
   * are applied and validated.
   */
  async draft(request: Request, user: AuthenticatedUser, check: boolean) {
    const batches = (await this.openBatches(request, user)).filter((b) => b.view.totals.received_qty > 0);
    const adjustmentFor = new Map<string, number>();
    if (check) for (const entry of Array.isArray(request.adjustments) ? request.adjustments : []) adjustmentFor.set(String(toObjectId(entry?.item_id) ?? ""), amount(entry?.amount, "A reduction"));
    const byItem = new Map<string, Doc>();
    for (const { view } of batches) {
      for (const line of view.lines) {
        const row = byItem.get(line.item_id) ?? { item_id: line.item_id, name: line.name, sent_qty: 0, received_qty: 0, received_amount: 0, missing_qty: 0, missing_amount: 0 };
        row.sent_qty += line.sent_qty; row.received_qty += line.received_qty; row.received_amount = money(row.received_amount + line.received_amount);
        row.missing_qty += line.missing_qty; row.missing_amount = money(row.missing_amount + line.missing_amount);
        byItem.set(line.item_id, row);
      }
    }
    const items = Array.from(byItem.values()).filter((i) => i.sent_qty > 0).map((i) => {
      const adjustment = adjustmentFor.get(i.item_id) ?? 0;
      if (adjustment > i.received_amount) throw new HttpError(400, `The reduction for ${i.name} is more than its amount (${i.received_amount}).`);
      return { ...i, adjustment, net_amount: money(i.received_amount - adjustment) };
    });
    const sum = (key: string) => money(items.reduce((n, i: Doc) => n + i[key], 0));
    const itemAdjustments = sum("adjustment");
    const beforeOverall = money(sum("received_amount") - itemAdjustments);
    const overall = check ? amount(request.adjustment, "The overall reduction") : 0;
    if (overall > beforeOverall) throw new HttpError(400, `The overall reduction is more than what is owed (${beforeOverall}).`);
    return {
      batches, count: batches.length, from: batches.length ? batches[0].view.date : null, to: batches.length ? batches[batches.length - 1].view.date : null, items,
      totals: { sent_qty: sum("sent_qty"), received_qty: sum("received_qty"), received_amount: sum("received_amount"), missing_qty: sum("missing_qty"), missing_amount: sum("missing_amount"), item_adjustments: itemAdjustments, overall_adjustment: overall, total_adjustment: money(itemAdjustments + overall), net_payable: money(beforeOverall - overall) },
    };
  },

  /** One settlement for everything that has come back. The batches it covers are closed, each at its own days' prices. */
  async settleAll(request: Request, user: AuthenticatedUser) {
    const window = settlementWindow(await readSchedule());
    if (!window.open) throw new HttpError(409, `Laundry can only be settled on ${window.summary}. The next settlement day is ${window.next_date}.`);
    const d = await this.draft(request, user, true);
    if (d.count === 0) throw new HttpError(400, "Nothing has come back yet, so there is nothing to settle.");
    const prices = await livePrices();
    const at = new Date();
    const payment = { mode: text(request.payment?.mode, 30) || "CASH", reference: text(request.payment?.reference, 80) };
    const note = text(request.note, 500);
    const settlementId = new ObjectId();
    await db().collection(SETTLEMENTS).insertOne({
      _id: settlementId, at, by: who(user), note, payment, vendor: text(request.vendor, 80), from: d.from, to: d.to, batch_ids: d.batches.map((b) => b.doc._id),
      items: d.items.map((i: Doc) => ({ ...i, item_id: new ObjectId(i.item_id) })), totals: d.totals,
    } as any);
    for (const { doc, view } of d.batches) {
      const items = view.lines.map((l: Doc) => ({ item_id: new ObjectId(l.item_id), name: l.name, unit_price: l.unit_price, sent_qty: l.sent_qty, received_qty: l.received_qty, missing_qty: l.missing_qty, sent_amount: l.sent_amount, received_amount: l.received_amount, missing_amount: l.missing_amount, adjustment: 0, net_amount: l.received_amount }));
      const settlement = {
        settlement_id: settlementId, at, by: who(user), note: "Settled together with other laundry", payment, items,
        totals: { sent_amount: view.totals.sent_amount, received_amount: view.totals.received_amount, missing_amount: view.totals.missing_amount, missing_qty: view.totals.missing_qty, item_adjustments: 0, overall_adjustment: 0, total_adjustment: 0, net_payable: view.totals.received_amount },
      };
      const frozen = (doc.lines ?? []).map((line: Doc) => ({ ...line, unit_price: priceOn(prices.get(String(line.item_id)), doc.date) ?? line.unit_price }));
      await db().collection(BATCHES).updateOne({ _id: doc._id, settlement: { $exists: false } }, { $set: { settlement, lines: frozen, updated_at: at } });
    }
    return { success: true, settlement_id: stringifyId(settlementId), net_payable: d.totals.net_payable, batches: d.count };
  },

  /** Past overall settlements, newest first. */
  async settlements(_request: Request, user: AuthenticatedUser) {
    const docs = await db().collection(SETTLEMENTS).find(user.outlets.includes("all") ? {} : { batch_ids: { $in: (await db().collection(BATCHES).find(outletFilter(user), { projection: { _id: 1 } }).toArray()).map((b) => b._id) } }).sort({ at: -1 }).limit(100).toArray();
    return { settlements: docs.map((doc) => ({ id: stringifyId(doc._id), at: doc.at, by: doc.by?.name ?? "", note: doc.note ?? "", payment: doc.payment, vendor: doc.vendor ?? "", from: doc.from, to: doc.to, batches: (doc.batch_ids ?? []).length, items: (doc.items ?? []).map((i: Doc) => ({ ...i, item_id: stringifyId(i.item_id) })), totals: doc.totals })) };
  },

  async vendorList() {
    return (await db().collection(VENDORS).find({}).sort({ sort_order: 1, name: 1 }).toArray()).map((doc) => ({ id: stringifyId(doc._id), name: doc.name, active: doc.active !== false }));
  },

  /** Administrator: the laundries / vendors that can be chosen when giving laundry. One left out is switched off, not deleted. */
  async saveVendors(request: Request, user: AuthenticatedUser) {
    assertAdmin(user, "change the laundry vendors");
    const collection = db().collection(VENDORS);
    const incoming = Array.isArray(request.vendors) ? request.vendors.slice(0, 100) : [];
    const seen = new Set<string>();
    for (const [index, vendor] of incoming.entries()) {
      const name = text(vendor?.name, 80);
      if (!name) throw new HttpError(400, "Every vendor needs a name.");
      if (seen.has(name.toLowerCase())) throw new HttpError(400, `"${name}" is listed twice.`);
      seen.add(name.toLowerCase());
      const id = toObjectId(vendor?.id);
      const fields = { name, active: vendor?.active !== false, sort_order: index, updated_at: new Date() };
      if (id) await collection.updateOne({ _id: id }, { $set: fields });
      else await collection.insertOne({ ...fields, created_at: new Date() });
    }
    const keep = incoming.map((v) => toObjectId(v?.id)).filter((id): id is ObjectId => id !== null);
    await collection.updateMany({ _id: { $nin: keep }, name: { $nin: incoming.map((v) => text(v?.name, 80)) } }, { $set: { active: false } });
    return { vendors: await this.vendorList() };
  },

  /** With a vendor list in place, a batch's vendor must be one of the active vendors (an unchanged old value is kept). */
  async checkVendor(name: string, current = "") {
    if (!name || name === current) return name;
    const vendors = await this.vendorList();
    if (vendors.length > 0 && !vendors.some((v) => v.active && v.name === name)) throw new HttpError(400, "Choose a laundry from the list.");
    return name;
  },

  async list(request: Request, user: AuthenticatedUser) {
    const filter: Record<string, any> = { ...outletFilter(user) };
    if (request.outlet_id) {
      const id = outletDirectory.idOf(request.outlet_id);
      if (!id) throw new HttpError(400, "Unknown branch");
      assertOutlet(user, id);
      filter.outlet_id = id;
    }
    if (request.from || request.to) filter.date = { ...(request.from ? { $gte: dayOf(request.from) } : {}), ...(request.to ? { $lte: dayOf(request.to) } : {}) };
    const docs = await db().collection(BATCHES).find(filter).sort({ date: -1, created_at: -1 }).limit(300).toArray();
    const prices = await livePrices();
    const all = docs.map((doc) => present(doc, prices));
    // "OPEN" is every record that is not settled yet: the current transactions, kept in view until they are settled.
    let batches = all;
    if (request.status === "OPEN") batches = all.filter((batch) => batch.status !== "SETTLED");
    else if (request.status) batches = all.filter((batch) => batch.status === request.status);
    const open = all;
    const unsettled = all.filter((b) => b.status !== "SETTLED");
    return {
      batches,
      window: settlementWindow(await readSchedule()),
      summary: {
        unsettled: unsettled.length,
        to_pay: money(unsettled.reduce((n, b) => n + b.totals.received_amount, 0)),
        from: unsettled.length ? unsettled.reduce((min, b) => (b.date < min ? b.date : min), unsettled[0].date) : null,
        out_now: open.filter((b) => b.status === "SENT" || b.status === "PARTIAL").length,
        to_settle: open.filter((b) => b.status !== "SETTLED" && b.totals.received_qty > 0).length,
        missing_items: open.reduce((n, b) => n + b.totals.missing_qty, 0),
        missing_value: money(open.reduce((n, b) => n + b.totals.missing_amount, 0)),
      },
    };
  },

  /** The prices and names of the chosen items as they are today, so the record keeps them whatever changes later. */
  async snapshot(lines: Request["lines"], date: string) {
    const requested = (Array.isArray(lines) ? lines : []).slice(0, 200);
    const merged = new Map<string, number>();
    for (const line of requested) {
      const id = toObjectId(line?.item_id);
      if (!id) throw new HttpError(400, "Choose an item from the list.");
      const qty = wholeNumber(line?.qty ?? 0, "A quantity");
      if (qty > 0) merged.set(String(id), (merged.get(String(id)) ?? 0) + qty);
    }
    if (merged.size === 0) throw new HttpError(400, "Add at least one item.");
    const docs = await db().collection(ITEMS).find({ _id: { $in: Array.from(merged.keys()).map((id) => new ObjectId(id)) } }).toArray();
    return Array.from(merged.entries()).map(([id, qty]) => {
      const item = docs.find((doc) => String(doc._id) === id);
      if (!item) throw new HttpError(400, "One of the items is no longer on the list.");
      return { item_id: item._id, name: item.name, unit_price: priceOn(pointsOf(item), date) ?? item.price, sent_qty: qty };
    });
  },

  async create(request: Request, user: AuthenticatedUser) {
    const outlet = outletDirectory.idOf(request.outlet_id);
    if (!outlet) throw new HttpError(400, "Choose the branch the laundry was sent from.");
    assertOutlet(user, outlet);
    const now = new Date();
    const day = dayOf(request.date);
    const doc = { outlet_id: outlet, date: day, vendor: await this.checkVendor(text(request.vendor, 80)), notes: text(request.notes, 500), lines: await this.snapshot(request.lines, day), receipts: [], created_at: now, updated_at: now, created_by: who(user) };
    const result = await db().collection(BATCHES).insertOne(doc as any);
    return { batch: present({ ...doc, _id: result.insertedId }, await livePrices()) };
  },

  /** Changes what was sent, the date or the notes. Only until something has come back. */
  async update(request: Request, user: AuthenticatedUser) {
    const batch = await loadBatch(request.id, user);
    if (batch.settlement) throw new HttpError(409, "This laundry has been settled and can no longer be changed.");
    const set: Doc = { updated_at: new Date() };
    if (request.date !== undefined) set.date = dayOf(request.date);
    if (request.vendor !== undefined) set.vendor = await this.checkVendor(text(request.vendor, 80), batch.vendor ?? "");
    if (request.notes !== undefined) set.notes = text(request.notes, 500);
    if (request.lines !== undefined) {
      if ((batch.receipts ?? []).length > 0) throw new HttpError(409, "Items cannot be changed once some of the laundry has come back. Undo the receipts first.");
      set.lines = await this.snapshot(request.lines, (set.date as string) ?? batch.date);
    }
    await db().collection(BATCHES).updateOne({ _id: batch._id }, { $set: set });
    return { batch: present(await loadBatch(request.id, user), await livePrices()) };
  },

  async remove(request: Request, user: AuthenticatedUser) {
    assertAdmin(user, "delete laundry records");
    const batch = await loadBatch(request.id, user);
    if (batch.settlement) throw new HttpError(409, "A settled record cannot be deleted.");
    if ((batch.receipts ?? []).length > 0) throw new HttpError(409, "Some of this laundry has come back. Undo the receipts first.");
    await db().collection(BATCHES).deleteOne({ _id: batch._id });
    return { success: true };
  },

  /** The laundry (or part of it) coming back on a day. What is still out stays missing until it arrives or is settled. */
  async receive(request: Request, user: AuthenticatedUser) {
    const batch = await loadBatch(request.id, user);
    if (batch.settlement) throw new HttpError(409, "This laundry has been settled. No more can be received.");
    const current = present(batch);
    const lines: Array<{ item_id: ObjectId; qty: number }> = [];
    for (const line of Array.isArray(request.lines) ? request.lines : []) {
      const id = toObjectId(line?.item_id);
      const row = current.lines.find((l: Doc) => l.item_id === stringifyId(id));
      if (!id || !row) throw new HttpError(400, "That item is not in this laundry.");
      const qty = wholeNumber(line?.qty ?? 0, `The quantity of ${row.name}`);
      if (qty === 0) continue;
      if (qty > row.missing_qty) throw new HttpError(400, `Only ${row.missing_qty} ${row.name} ${row.missing_qty === 1 ? "is" : "are"} still out, but ${qty} ${qty === 1 ? "was" : "were"} entered.`);
      lines.push({ item_id: id, qty });
    }
    if (lines.length === 0) throw new HttpError(400, "Enter how many of at least one item came back.");
    const receipt = { _id: new ObjectId(), date: dayOf(request.date), at: new Date(), by: who(user), note: text(request.note, 300), lines };
    await db().collection(BATCHES).updateOne({ _id: batch._id }, { $push: { receipts: receipt } as any, $set: { updated_at: new Date() } });
    return { batch: present(await loadBatch(request.id, user), await livePrices()) };
  },

  async undoReceipt(request: Request, user: AuthenticatedUser) {
    const batch = await loadBatch(request.id, user);
    if (batch.settlement) throw new HttpError(409, "This laundry has been settled and can no longer be changed.");
    const receiptId = toObjectId(request.receipt_id);
    if (!receiptId || !(batch.receipts ?? []).some((r: Doc) => String(r._id) === String(receiptId))) throw new HttpError(404, "That receipt was not found.");
    await db().collection(BATCHES).updateOne({ _id: batch._id }, { $pull: { receipts: { _id: receiptId } } as any, $set: { updated_at: new Date() } });
    return { batch: present(await loadBatch(request.id, user), await livePrices()) };
  },

  /**
   * Settles what is owed for what actually came back. Each item can be adjusted (reduced) and so can the total; the
   * adjustments are kept with the settlement. Anything still missing is not charged, stays on record as missing, and is
   * marked as written off here.
   */
  async settle(request: Request, user: AuthenticatedUser) {
    const batch = await loadBatch(request.id, user);
    if (batch.settlement) throw new HttpError(409, "This laundry has already been settled.");
    const window = settlementWindow(await readSchedule());
    if (!window.open) throw new HttpError(409, `Laundry can only be settled on ${window.summary}. The next settlement day is ${window.next_date}.`);
    const prices = await livePrices();
    const current = present(batch, prices);
    if (current.totals.received_qty === 0) throw new HttpError(400, "Nothing has come back yet, so there is nothing to settle.");
    const adjustmentFor = new Map<string, number>();
    for (const entry of Array.isArray(request.adjustments) ? request.adjustments : []) {
      const id = String(toObjectId(entry?.item_id) ?? "");
      if (!current.lines.some((l: Doc) => l.item_id === id)) throw new HttpError(400, "An adjustment names an item that is not in this laundry.");
      adjustmentFor.set(id, amount(entry?.amount, "An adjustment"));
    }
    const items = current.lines.map((line: Doc) => {
      const adjustment = adjustmentFor.get(line.item_id) ?? 0;
      if (adjustment > line.received_amount) throw new HttpError(400, `The adjustment for ${line.name} is more than its amount (${line.received_amount}).`);
      return { item_id: new ObjectId(line.item_id), name: line.name, unit_price: line.unit_price, sent_qty: line.sent_qty, received_qty: line.received_qty, missing_qty: line.missing_qty, sent_amount: line.sent_amount, received_amount: line.received_amount, missing_amount: line.missing_amount, adjustment, net_amount: money(line.received_amount - adjustment) };
    });
    const itemAdjustments = money(items.reduce((n: number, i: Doc) => n + i.adjustment, 0));
    const overall = amount(request.adjustment, "The overall adjustment");
    const beforeOverall = money(current.totals.received_amount - itemAdjustments);
    if (overall > beforeOverall) throw new HttpError(400, `The overall adjustment is more than what is owed (${beforeOverall}).`);
    const net = money(beforeOverall - overall);
    const settlement = {
      at: new Date(),
      by: who(user),
      note: text(request.note, 500),
      payment: { mode: text(request.payment?.mode, 30) || "CASH", reference: text(request.payment?.reference, 80) },
      items,
      totals: {
        sent_amount: current.totals.sent_amount,
        received_amount: current.totals.received_amount,
        missing_amount: current.totals.missing_amount,
        missing_qty: current.totals.missing_qty,
        item_adjustments: itemAdjustments,
        overall_adjustment: overall,
        total_adjustment: money(itemAdjustments + overall),
        net_payable: net,
      },
    };
    // Freeze today's prices on the record so it never changes again.
    const frozen = (batch.lines ?? []).map((line: Doc) => ({ ...line, unit_price: priceOn(prices.get(String(line.item_id)), batch.date) ?? line.unit_price }));
    await db().collection(BATCHES).updateOne({ _id: batch._id }, { $set: { settlement, lines: frozen, updated_at: new Date() } });
    return { batch: present(await loadBatch(request.id, user), await livePrices()) };
  },

  /** Administrator: when settlement is allowed. */
  async saveSettings(request: Request, user: AuthenticatedUser) {
    assertAdmin(user, "change when laundry can be settled");
    const body: Doc = (request as Doc).window ?? request;
    const rule = ["FIRST", "LAST", "DAY"].includes(body.rule) ? body.rule : "LAST";
    const day = Number(body.day);
    if (rule === "DAY" && (!Number.isInteger(day) || day < 1 || day > 31)) throw new HttpError(400, "Choose a day of the month from 1 to 31.");
    await db().collection(SETTINGS).updateOne({ _id: "settlement" as any }, { $set: { restrict: body.restrict === true, rule, day: rule === "DAY" ? day : 1, updated_at: new Date(), updated_by: who(user) } }, { upsert: true });
    return { window: settlementWindow(await readSchedule()) };
  },

  /** Administrator: adds sample items and laundry records (marked as demo) to try the screens. */
  async seedDemo(user: AuthenticatedUser) {
    assertAdmin(user, "add demo laundry data");
    const outletKey = user.outlets.includes("all") ? outletDirectory.allKeys()[0] : user.outlets[0];
    const outlet = outletDirectory.idOf(outletKey);
    if (!outlet) throw new HttpError(400, "Add a branch first.");
    const items = db().collection(ITEMS);
    const batches = db().collection(BATCHES);
    if (await batches.countDocuments({ demo: true }) > 0) throw new HttpError(409, "Demo data is already there. Clear it first to add it again.");
    const catalog = [["Bed sheet", 25], ["Pillow cover", 8], ["Bath towel", 20], ["Hand towel", 10], ["Blanket", 80]] as const;
    const ids = new Map<string, ObjectId>();
    for (const [index, [name, price]] of catalog.entries()) {
      const found = await items.findOne({ name });
      if (found) ids.set(name, found._id);
      else ids.set(name, (await items.insertOne({ name, price, price_history: [{ price, from: BEGINNING }], active: true, sort_order: index + 1000, demo: true, created_at: new Date(), updated_at: new Date() } as any)).insertedId);
    }
    const now = new Date();
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const make = (ago: number, sent: Record<string, number>, back: Record<string, number>[]) => ({
      outlet_id: outlet, date: daysAgo(ago), vendor: "Demo Laundry", notes: "Demo data", demo: true,
      lines: Object.entries(sent).map(([name, qty]) => ({ item_id: ids.get(name)!, name, unit_price: catalog.find((c) => c[0] === name)![1], sent_qty: qty })),
      receipts: back.map((lines, i) => ({ _id: new ObjectId(), date: daysAgo(Math.max(ago - 1 - i, 0)), at: now, by: who(user), note: "", lines: Object.entries(lines).map(([name, qty]) => ({ item_id: ids.get(name)!, qty })) })),
      created_at: now, updated_at: now, created_by: who(user),
    });
    await batches.insertMany([
      make(9, { "Bed sheet": 40, "Pillow cover": 60, "Bath towel": 30 }, [{ "Bed sheet": 40, "Pillow cover": 60, "Bath towel": 30 }]),
      make(6, { "Bed sheet": 35, "Hand towel": 25, Blanket: 6 }, [{ "Bed sheet": 20, "Hand towel": 25 }, { "Bed sheet": 12, Blanket: 6 }]),
      make(3, { "Bed sheet": 30, "Pillow cover": 45, "Bath towel": 20 }, [{ "Bed sheet": 30, "Pillow cover": 40 }]),
      make(1, { "Bed sheet": 28, "Bath towel": 18, "Hand towel": 20 }, []),
    ] as any[]);
    return { success: true };
  },

  async clearDemo(user: AuthenticatedUser) {
    assertAdmin(user, "clear demo laundry data");
    await db().collection(BATCHES).deleteMany({ demo: true });
    await db().collection(ITEMS).deleteMany({ demo: true });
    return { success: true };
  },

  /** Everything that has not come back, by item and by day, whether or not the laundry was settled. */
  async missing(request: Request, user: AuthenticatedUser) {
    const filter: Record<string, any> = { ...outletFilter(user) };
    if (request.outlet_id) {
      const id = outletDirectory.idOf(request.outlet_id);
      if (!id) throw new HttpError(400, "Unknown branch");
      assertOutlet(user, id);
      filter.outlet_id = id;
    }
    const prices = await livePrices();
    const batches = (await db().collection(BATCHES).find(filter).sort({ date: -1 }).toArray()).map((doc) => present(doc, prices));
    const byItem = new Map<string, { name: string; open_qty: number; open_amount: number; written_off_qty: number; written_off_amount: number }>();
    const rows: Doc[] = [];
    for (const batch of batches) {
      for (const line of batch.lines) {
        if (line.missing_qty === 0) continue;
        const state = batch.status === "SETTLED" ? "written_off" : "open";
        const entry = byItem.get(line.item_id) ?? { name: line.name, open_qty: 0, open_amount: 0, written_off_qty: 0, written_off_amount: 0 };
        if (state === "open") { entry.open_qty += line.missing_qty; entry.open_amount = money(entry.open_amount + line.missing_amount); }
        else { entry.written_off_qty += line.missing_qty; entry.written_off_amount = money(entry.written_off_amount + line.missing_amount); }
        byItem.set(line.item_id, entry);
        rows.push({ batch_id: batch.id, date: batch.date, vendor: batch.vendor, outlet_id: batch.outlet_id, item: line.name, sent_qty: line.sent_qty, received_qty: line.received_qty, missing_qty: line.missing_qty, missing_amount: line.missing_amount, state, settled_on: batch.settlement?.at ?? null });
      }
    }
    return { by_item: Array.from(byItem.values()).sort((a, b) => b.open_qty + b.written_off_qty - (a.open_qty + a.written_off_qty)), rows };
  },
};
