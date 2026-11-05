import { createContext, useContext } from 'react';
import type { AppData, Me } from './types';
import type { Store } from './data/store';

export interface Ctx {
  data: AppData;
  me: Me;
  store: Store;
  /** Current business day in Dubai (YYYY-MM-DD). */
  today: string;
  /** Re-read everything from the database. */
  refresh(): Promise<void>;
  toast(text: string): void;
  /** Runs a save, shows errors in plain words, refreshes after. */
  run(task: () => Promise<unknown>, done?: string): Promise<boolean>;
  /** Demo mode only: switch between Owner and Staff view. */
  setDemoRole?(r: Me['role']): void;
}

export const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('App context missing');
  return c;
}
