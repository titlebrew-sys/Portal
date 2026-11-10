import type { AppData, CountItem, CountRow, CountSession, Ingredient, Me, ModifierRule, Order, Receipt, Recipe, RecipeChange, Rule, SalesReport, SalesRow, Supplier, WasteRow } from '../types';
import type { LyItem } from '../lib/importRecipes';
import type { LiveSales } from '../types';

export type NewOrder = Omit<Order, 'id' | 'lpoNumber' | 'receivedAt' | 'receivedBy' | 'received'>;

/** Everything the screens can ask the database to do. */
export interface Store {
  mode: 'demo' | 'live';
  load(): Promise<AppData>;
  saveCounts(rows: CountRow[], session: CountSession): Promise<void>;
  addWaste(rows: Omit<WasteRow, 'id'>[]): Promise<void>;
  /** Saves a sent order. When takeLpo is true it also takes the next LPO number. */
  sendOrder(o: NewOrder, takeLpo: boolean): Promise<Order>;
  receiveOrder(id: string, received: { ruleId: string; qty: number }[], by: string): Promise<void>;
  saveRule(r: Rule): Promise<void>;
  saveSupplier(s: Supplier): Promise<void>;
  saveItem(i: CountItem): Promise<void>;
  importSales(rows: SalesRow[], period: string): Promise<void>;
  /** Live only: copy the prototype setup (items, suppliers, rules) into an empty database. */
  loadStartingData?(): Promise<void>;

  // ---- phase 2: Loyverse, recipes, stock
  /** Receipts sold between two moments (ISO UTC). Money only for the owner. */
  loadReceipts(fromIso: string, toIso: string): Promise<Receipt[]>;
  /** Sales by day, hour, item and choice for business days from..to. Owner only. */
  salesReport(from: string, to: string): Promise<SalesReport | null>;
  /** The Loyverse menu with components, for building starting recipes. */
  loyverseMenu(): Promise<LyItem[]>;
  saveIngredient(i: Ingredient): Promise<void>;
  saveRecipes(r: Recipe[]): Promise<void>;
  saveModifierRule(r: ModifierRule): Promise<void>;
  /** Copy the starting ingredients and modifier rules (only the ones missing). */
  seedStock(ingredients: Ingredient[], rules: ModifierRule[]): Promise<void>;
  recipeHistory(targetId?: string): Promise<RecipeChange[]>;
  /** Sheet item name -> portal count item, for names the Google Sheet spells differently. */
  saveAlias(name: string, itemId: string): Promise<void>;
  /** Yesterday's and today's sales straight from Loyverse, with the till check. */
  liveSales(): Promise<LiveSales>;
  /** Owner: enter the real weight of a roast (replaces the assumed amount). */
  saveRoast(r: { date: string; ingredientId: string; grams: number }): Promise<void>;
  deleteRoast(id: string): Promise<void>;
  /** Ask the Loyverse sync to run now (owner). */
  syncNow?(): Promise<string>;
}

export interface Auth {
  me(): Promise<Me | null>;
  staffList(): Promise<{ name: string; email: string }[]>;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  onChange(cb: () => void): () => void;
}
