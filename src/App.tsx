import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, Me } from './types';
import type { Auth, Store } from './data/store';
import { AppCtx, type Ctx } from './ctx';
import { Icon, Seg } from './components';
import { demoStore, resetDemo } from './data/demo';
import { liveAuth, liveStore, supabaseConfigured } from './data/supabase';
import { businessDate } from './lib/time';
import { dueToday } from './lib/derive';
import { Login } from './views/Login';
import { Today } from './views/Today';
import { Count } from './views/Count';
import { Orders } from './views/Orders';
import { Deliveries } from './views/Deliveries';
import { Waste } from './views/Waste';
import { Sales } from './views/Sales';
import { Rules } from './views/Rules';
import { Stock } from './views/Stock';
import { Differences } from './views/Differences';
import { Recipes } from './views/Recipes';
import { HowItWorks } from './views/HowItWorks';
import { More } from './views/More';

const VIEWS = [
  { id: 'home', label: 'Today', icon: 'home', staff: true },
  { id: 'count', label: 'Count', icon: 'count', staff: true },
  { id: 'orders', label: 'Orders', icon: 'orders', staff: true },
  { id: 'receive', label: 'Deliveries', icon: 'receive', staff: true },
  { id: 'waste', label: 'Waste', icon: 'waste', staff: true },
  { id: 'stock', label: 'Stock', icon: 'stock', staff: true },
  { id: 'differences', label: 'Differences', icon: 'diff', staff: true },
  { id: 'recipes', label: 'Recipes', icon: 'recipes', staff: true },
  { id: 'sales', label: 'Sales', icon: 'sales', staff: false },
  { id: 'rules', label: 'Items and rules', icon: 'rules', staff: false },
  { id: 'how', label: 'How it works', icon: 'how', staff: true },
  { id: 'more', label: 'More', icon: 'more', staff: true },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

function useHash(): string {
  const [h, setH] = useState(location.hash.replace('#', ''));
  useEffect(() => {
    const f = () => setH(location.hash.replace('#', ''));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export default function App() {
  const live = supabaseConfigured;
  const auth = useMemo<Auth | null>(() => (live ? liveAuth() : null), [live]);
  const [me, setMe] = useState<Me | null>(live ? null : { name: 'Rimma', role: 'owner' });
  const [checked, setChecked] = useState(!live);
  const meRef = useRef(me);
  meRef.current = me;
  const store = useMemo<Store>(() => (live ? liveStore(() => meRef.current?.role === 'owner', () => meRef.current?.name ?? 'Owner') : demoStore()), [live]);

  // Who is signed in (live mode)
  useEffect(() => {
    if (!auth) return;
    const check = () => auth.me().then((m) => { setMe(m); setChecked(true); });
    check();
    return auth.onChange(check);
  }, [auth]);

  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(businessDate());
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  const refresh = useCallback(async () => {
    try {
      setData(await store.load());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [store]);

  useEffect(() => {
    if (me) refresh();
  }, [me?.name, me?.role, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Roll over to the new business day at 4am and pick up other people's saves.
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = businessDate();
      setToday((old) => (old !== d ? d : old));
    }, 60_000);
    const onFocus = () => me && refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [me, refresh]);

  const toast = useCallback((t: string) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), 3000);
  }, []);

  const run = useCallback(
    async (task: () => Promise<unknown>, done?: string) => {
      try {
        await task();
        await refresh();
        if (done) toast(done);
        return true;
      } catch (e) {
        toast('Not saved: ' + (e as Error).message);
        return false;
      }
    },
    [refresh, toast],
  );

  const hash = useHash();

  if (!checked) return <div className="login"><p className="sub">Loading…</p></div>;
  if (!me && auth) return <Login auth={auth} />;
  if (!me) return null;
  if (error && !data)
    return (
      <div className="login">
        <div className="card">
          <h2>Could not load the portal</h2>
          <p className="sub">{error}</p>
          <button className="btn primary" onClick={refresh}>Try again</button>
          {auth && <button className="btn" onClick={() => auth.signOut()}>Sign out</button>}
        </div>
      </div>
    );
  if (!data) return <div className="login"><p className="sub">Loading…</p></div>;

  const vis = VIEWS.filter((v) => v.id !== 'more' && (me.role === 'owner' || v.staff));
  const cur: ViewId = (hash === 'more' ? 'more' : vis.find((v) => v.id === hash)?.id ?? 'home') as ViewId;
  const due = dueToday(data, today).length;

  const ctx: Ctx = {
    data, me, store, today, refresh, toast, run,
    setDemoRole: store.mode === 'demo' ? (r) => setMe({ name: r === 'owner' ? 'Rimma' : 'Staff', role: r }) : undefined,
  };

  const View = { home: Today, count: Count, orders: Orders, receive: Deliveries, waste: Waste, sales: Sales, rules: Rules, stock: Stock, differences: Differences, recipes: Recipes, how: HowItWorks, more: () => <More views={vis} /> }[cur];
  const tabs = [...vis.slice(0, 4), VIEWS.find((v) => v.id === 'more')!];

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <aside className="rail" aria-label="Main">
          <div className="logo">Title Brew<small>Operations portal</small></div>
          <nav className="navlist">
            {vis.map((v) => (
              <a key={v.id} className="nav" href={'#' + v.id} aria-current={v.id === cur ? 'page' : undefined}>
                <Icon name={v.icon} />
                <span>{v.label}</span>
                {v.id === 'orders' && due > 0 && <span className="badge">{due}</span>}
              </a>
            ))}
          </nav>
          <div className="who">
            {ctx.setDemoRole ? (
              <>
                <label>Viewing as</label>
                <Seg label="Viewing as" value={me.role} onChange={ctx.setDemoRole} options={[{ v: 'owner', l: 'Owner' }, { v: 'staff', l: 'Staff' }]} />
                <p style={{ margin: '10px 0 0', color: 'var(--muted)' }}>
                  Demo mode. Changes stay on this device.{' '}
                  <button className="link" onClick={() => { resetDemo(); location.reload(); }}>Reset</button>
                </p>
              </>
            ) : (
              <div className="who-line">
                <span><b>{me.name}</b><br /><span style={{ color: 'var(--muted)' }}>{me.role === 'owner' ? 'Owner' : 'Staff'}</span></span>
                <button className="btn sm" onClick={() => auth?.signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </aside>
        <main>
          <div className="page">
            {error && <div className="banner bad noprint">Could not refresh: {error}</div>}
            <View />
            {auth && (
              <div className="noprint mobile-only" style={{ textAlign: 'center' }}>
                <button className="link" onClick={() => auth.signOut()}>Sign out {me.name}</button>
              </div>
            )}
          </div>
        </main>
      </div>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((v) => (
          <a key={v.id} href={'#' + v.id} aria-current={v.id === cur || (v.id === 'more' && !tabs.slice(0, 4).some((t) => t.id === cur)) ? 'page' : undefined}>
            <Icon name={v.icon} size={22} />
            <span>{v.label}</span>
          </a>
        ))}
      </nav>
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </AppCtx.Provider>
  );
}
