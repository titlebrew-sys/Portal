export type Role = 'owner' | 'staff';
export type Area = 'Bar' | 'Kitchen' | 'Weekly';
export type Shift = 1 | 2;
export type RuleKind = 'TARGET' | 'TOPUP' | 'FIXED' | 'TRACK';
export type WasteReason = 'Expired' | 'Damaged' | 'Not sold';

/** Something staff count: one row on the Count screen. */
export interface CountItem {
  id: string;
  area: Area;
  section: string;
  name: string;
  unit: string;
  hint: string | null;
  sort: number;
  /** Kitchen items: counted as old batch + new batch, each with an expiry date. */
  hasBatches: boolean;
  /** Kitchen items kept in the freezer: an extra frozen count. */
  hasFrozen: boolean;
  active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  /** How the order goes out, e.g. "WhatsApp group", "Email with LPO attached", "Website". */
  how: string;
  email: string | null;
  cutoff: string;
  delivery: string;
  /** Lead time in days from order to delivery (1 = next day). */
  leadDays: number;
  /** Weekdays with no delivery, 0 = Sunday ... 6 = Saturday. */
  noDeliveryDays: number[];
  openText: string;
  closeText: string | null;
  minOrder: number | null;
  freeDelivery: number | null;
  notes: string | null;
  /** Counted weekly (packaging) instead of every Shift 1. */
  weekly: boolean;
  usesLpo: boolean;
  /** Delivery time written in the email, e.g. "7.30am". */
  deliveryTime: string | null;
  satDeliveryTime: string | null;
  /** Contact line printed on the LPO, e.g. "Mr. Name +971 ...". Kept in the database, not in code. */
  lpoContact: string | null;
  sort: number;
}

/** One order line rule. Ties a supplier product to what staff count. */
export interface Rule {
  id: string;
  /** Empty for TRACK items: counted, never ordered. */
  supplierId: string | null;
  orderItem: string;
  /**
   * What count it reads. A count item id, or a formula of item ids with weights,
   * e.g. "bar-condensed-cans + 1.5*bar-condensed-bottles".
   */
  countFrom: string;
  rule: RuleKind;
  /** Unit written in the order message, e.g. "pcs", "case", "bottle". */
  orderUnit: string;
  /** How many count units one order unit holds (2L bottle counted in L = 2). */
  packSize: number;
  // TARGET
  estDailyUse: number | null;
  fixedTarget: number | null;
  /** Fixed target used when the delivery lands on a Saturday (Friday orders). */
  satTarget: number | null;
  /** Extra days of stock on top of the gap to the next delivery. */
  extraDays: number;
  // TOPUP / FIXED
  minLevel: number | null;
  maxLevel: number | null;
  fixedQty: number | null;
  price: number | null;
  active: boolean;
  sort: number;
}

export interface CountRow {
  businessDate: string;
  shift: Shift;
  itemId: string;
  qty: number | null;
  oldQty: number | null;
  newQty: number | null;
  frozenQty: number | null;
  expOld: string | null;
  expNew: string | null;
  countedBy: string;
  savedAt: string;
}

export interface CountSession {
  businessDate: string;
  shift: Shift;
  area: Area;
  savedBy: string;
  savedAt: string;
  done: number;
  total: number;
}

export interface OrderLine {
  ruleId: string;
  name: string;
  qty: number;
  unit: string;
  price: number | null;
}

export interface Order {
  id: string;
  businessDate: string;
  supplierId: string;
  lines: OrderLine[];
  message: string;
  lpoNumber: number | null;
  sentBy: string;
  sentAt: string;
  receivedAt: string | null;
  receivedBy: string | null;
  received: { ruleId: string; qty: number }[] | null;
}

export interface WasteRow {
  id: string;
  date: string;
  item: string;
  qty: number;
  reason: WasteReason;
  loggedBy: string;
  /** When it was logged (ISO). Used to place waste between two counts. */
  createdAt?: string;
}

export interface SalesRow {
  item: string;
  cat: string;
  qty: number;
  net: number;
  gp: number;
  m: number;
  disc: number;
  tax: number;
}

export interface Me {
  name: string;
  role: Role;
}

export interface AppData {
  items: CountItem[];
  suppliers: Supplier[];
  rules: Rule[];
  counts: CountRow[];
  sessions: CountSession[];
  orders: Order[];
  waste: WasteRow[];
  sales: SalesRow[];
  salesPeriod: string | null;
  lpoNext: number;
  /** Ingredients, recipes, modifier rules and sync status (phase 2). */
  book: StockBook;
}

// ---------------------------------------------------------------- phase 2: Loyverse, recipes, stock

/** One shop. Everything new carries it so a second branch can be added later. */
export const LOCATION_ID = 'business-bay';

export type IngredientUnit = 'g' | 'ml' | 'pcs';

/** Something a sale uses up: beans, milk, a cup, a sandwich. Always in g, ml or pieces. */
export interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  /**
   * How a count becomes this ingredient, in its unit. Count item ids with a factor,
   * e.g. "1000*bar-full-fat-milk" (litres counted, ml used). Empty: not counted.
   */
  countFrom: string;
  /** Allowed difference before an alert, in percent. Pieces: 0 (any difference). */
  limitPct: number;
  /** Shown when a setting still needs filling in, e.g. pieces per sleeve. */
  note: string | null;
  active: boolean;
  sort: number;
}

/** "milk": replaced by the milk chosen on the sale. "coffee": comes from the bean chosen. */
export type LineRole = 'milk' | 'coffee';

export interface RecipeLine {
  /** Ingredient used, or for role lines the default (full fat milk, Brazil beans). */
  ingredientId?: string;
  /** Use part of another menu item's recipe instead, e.g. 0.1 of Hibiscus Iced. */
  recipeOf?: string;
  qty: number;
  role?: LineRole;
}

export interface Recipe {
  /** Loyverse item id (or "name:<item name>" before the item is synced). */
  id: string;
  itemName: string;
  lines: RecipeLine[];
  /** Cups, lids and straws used only for take-away. */
  takeaway: { ingredientId: string; qty: number }[];
  /** Modifier groups to ignore on this item (bundles ignore the Classic Coffee choice). */
  ignoreGroups: string[];
  note: string | null;
  updatedBy: string;
  updatedAt: string;
}

export type ModifierEffect =
  | { type: 'milk'; ingredientId: string }
  | { type: 'bean'; ingredientId: string }
  | { type: 'add'; qty: number; ingredientId?: string; role?: LineRole; byItem?: Record<string, string> }
  | { type: 'spread'; qty: number; among: string[] }
  | { type: 'recipeOf' }
  | { type: 'swapCup'; from: string; to: string }
  | { type: 'none' };

/** What a modifier choice does, e.g. Alternative Milk: Oat replaces the milk with oat milk. */
export interface ModifierRule {
  id: string;
  /** Modifier group name as in Loyverse, or "*" for any group. */
  group: string;
  /** Choice name as in Loyverse, or "*" for any choice in the group. */
  option: string;
  effects: ModifierEffect[];
  note: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface RecipeChange {
  id: string;
  kind: 'recipe' | 'modifier' | 'ingredient';
  targetId: string;
  label: string;
  before: unknown;
  after: unknown;
  changedBy: string;
  changedAt: string;
}

export interface SaleModifier {
  group: string;
  option: string;
}

export interface SaleLine {
  idx: number;
  itemId: string | null;
  itemName: string;
  variantName: string | null;
  qty: number;
  /** Money: only filled for the owner. */
  total: number | null;
  modifiers: SaleModifier[];
}

/** A Loyverse receipt. Times are stored in UTC and shown in Dubai time. */
export interface Receipt {
  number: string;
  type: 'SALE' | 'REFUND';
  /** When it was sold (receipt_date), ISO UTC. */
  at: string;
  businessDate: string;
  dining: string | null;
  cancelled: boolean;
  total: number | null;
  employee: string | null;
  lines: SaleLine[];
}

export interface SyncRun {
  id: string;
  kind: 'loyverse' | 'sheet';
  startedAt: string;
  finishedAt: string | null;
  receipts: number;
  ok: boolean;
  message: string;
  latestReceiptAt: string | null;
}

export interface LoyverseItem {
  id: string;
  name: string;
  category: string | null;
}

export interface SalesReport {
  totals: { receipts: number; sales: number; items: number };
  byDay: { date: string; sales: number; receipts: number }[];
  byHour: { hour: number; sales: number; receipts: number }[];
  byItem: { item: string; qty: number; sales: number }[];
  byModifier: { group: string; option: string; qty: number; sales: number }[];
}

export interface StockBook {
  ingredients: Ingredient[];
  recipes: Recipe[];
  modifierRules: ModifierRule[];
  loyverseItems: LoyverseItem[];
  syncRuns: SyncRun[];
}
