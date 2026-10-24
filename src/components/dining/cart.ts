"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { CartItem, MenuItem } from "./types";
import { toNumber } from "./utils";

const DEFAULT_PREP_MINUTES = 10;

const storageKey = (outletId: string) => `rc-cart:${outletId}`;

const loadCart = (outletId: string): CartItem[] => {
  try {
    const raw = sessionStorage.getItem(storageKey(outletId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: CartItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const id = e.id ? String(e.id) : "";
      if (!id) continue;
      const quantity = Math.max(1, Math.floor(toNumber(e.quantity as number | string, 1)));
      items.push({
        id,
        name: typeof e.name === "string" ? e.name : "Item",
        price: toNumber(e.price as number | string),
        quantity,
        prepTime: toNumber(e.prepTime as number | string),
        notes: typeof e.notes === "string" && e.notes ? e.notes : undefined,
      });
    }
    return items;
  } catch {
    return [];
  }
};

const saveCart = (outletId: string, items: CartItem[]) => {
  try {
    if (items.length === 0) sessionStorage.removeItem(storageKey(outletId));
    else sessionStorage.setItem(storageKey(outletId), JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
};

/** Removes the persisted cart for an outlet (used when a stay ends). */
export const discardCart = (outletId: string) => {
  try {
    sessionStorage.removeItem(storageKey(outletId));
  } catch {
    /* storage unavailable */
  }
};

type Action =
  | { type: "SET"; items: CartItem[] }
  | { type: "CLEAR" }
  | { type: "ADD"; item: MenuItem }
  | { type: "INC"; id: string }
  | { type: "DEC"; id: string }
  | { type: "NOTE"; id: string; notes: string };

const reducer = (state: CartItem[], action: Action): CartItem[] => {
  switch (action.type) {
    case "SET":
      return action.items;
    case "CLEAR":
      return [];
    case "ADD": {
      const { item } = action;
      if (state.some((i) => i.id === item.id)) {
        return state.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...state,
        {
          id: item.id,
          name: item.name ?? "Item",
          price: toNumber(item.price),
          quantity: 1,
          prepTime: toNumber(item.prep_time_minutes, DEFAULT_PREP_MINUTES),
        },
      ];
    }
    case "INC":
      return state.map((i) => (i.id === action.id ? { ...i, quantity: i.quantity + 1 } : i));
    case "DEC":
      return state.flatMap((i) => {
        if (i.id !== action.id) return [i];
        return i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : [];
      });
    case "NOTE":
      return state.map((i) => (i.id === action.id ? { ...i, notes: action.notes || undefined } : i));
    default:
      return state;
  }
};

/**
 * Cart persisted per outlet in sessionStorage (`rc-cart:<outletId>`).
 * Pass null when there is no ordering context; the cart is then empty and not persisted.
 */
export function useCart(outletId: string | null | undefined) {
  const key = outletId || null;
  const [items, dispatch] = useReducer(reducer, []);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    dispatch({ type: "SET", items: key ? loadCart(key) : [] });
    setLoadedFor(key);
  }, [key]);

  useEffect(() => {
    if (key && loadedFor === key) saveCart(key, items);
  }, [items, key, loadedFor]);

  const ready = key === loadedFor;

  const totals = useMemo(
    () => ({
      count: items.reduce((s, i) => s + i.quantity, 0),
      total: items.reduce((s, i) => s + i.price * i.quantity, 0),
      prep: items.reduce((m, i) => Math.max(m, i.prepTime || 0), 0),
    }),
    [items],
  );

  const add = useCallback((item: MenuItem) => dispatch({ type: "ADD", item }), []);
  const inc = useCallback((id: string) => dispatch({ type: "INC", id }), []);
  const dec = useCallback((id: string) => dispatch({ type: "DEC", id }), []);
  const setNotes = useCallback((id: string, notes: string) => dispatch({ type: "NOTE", id, notes }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  return { items, ready, ...totals, add, inc, dec, setNotes, clear };
}
