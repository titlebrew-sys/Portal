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
}
