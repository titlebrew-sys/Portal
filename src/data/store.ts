import type { AppData, CountItem, CountRow, CountSession, Me, Order, Rule, SalesRow, Supplier, WasteRow } from '../types';

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
}

export interface Auth {
  me(): Promise<Me | null>;
  staffList(): Promise<{ name: string; email: string }[]>;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  onChange(cb: () => void): () => void;
}
