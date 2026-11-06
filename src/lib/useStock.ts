import { useEffect, useMemo, useState } from 'react';
import type { AppData, Receipt } from '../types';
import type { Store } from '../data/store';
import { addDays } from './time';
import { makeBook, receiptUsage, type LineUsage, type RecipeBook } from './usage';
import type { StockInputs } from './stock';

/** Business day d starts at 4am Dubai = 00:00 UTC. */
export const dayStart = (d: string) => `${d}T00:00:00.000Z`;
export const dayEnd = (d: string) => `${addDays(d, 1)}T00:00:00.000Z`;

/** Receipts are fetched once per range and kept while the page is open. */
const cache = new Map<string, Promise<Receipt[]>>();
export function receiptsBetween(store: Store, fromIso: string, toIso: string): Promise<Receipt[]> {
  const nowMinute = new Date().toISOString().slice(0, 16);
  const key = `${store.mode}|${fromIso}|${toIso}|${toIso > nowMinute ? nowMinute : ''}`;
  if (!cache.has(key)) {
    const p = store.loadReceipts(fromIso, toIso);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}
export const clearReceiptCache = () => cache.clear();

export interface StockData {
  loading: boolean;
  error: string | null;
  book: RecipeBook;
  usage: LineUsage[];
  inputs: StockInputs;
  receipts: Receipt[];
}

/**
 * Usage for business days from..to, plus what the stock engine needs. Receipts are loaded from
 * 8 days earlier so the count before the first day (even a weekly one) has its usage too.
 */
export function useStockData(data: AppData, store: Store, from: string, to: string): StockData {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    receiptsBetween(store, dayStart(addDays(from, -8)), dayEnd(to))
      .then((r) => { if (live) { setReceipts(r); setError(null); } })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [store, from, to]);
  const book = useMemo(() => makeBook(data.book.ingredients, data.book.recipes, data.book.modifierRules), [data.book]);
  const usage = useMemo(() => receiptUsage(book, receipts), [book, receipts]);
  const inputs: StockInputs = useMemo(
    () => ({ items: data.items, counts: data.counts, orders: data.orders, rules: data.rules, suppliers: data.suppliers, waste: data.waste, usage }),
    [data, usage],
  );
  return { loading, error, book, usage, inputs, receipts };
}
