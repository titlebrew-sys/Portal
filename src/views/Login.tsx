import { useEffect, useState } from 'react';
import type { Auth } from '../data/store';
import { Seg } from '../components';

/** Staff tap their name and type their PIN. The owner signs in with email and password. */
export function Login({ auth }: { auth: Auth }) {
  const [tab, setTab] = useState<'staff' | 'owner'>('staff');
  const [staff, setStaff] = useState<{ name: string; email: string }[] | null>(null);
  const [pick, setPick] = useState<{ name: string; email: string } | null>(null);
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    auth.staffList().then(setStaff);
  }, [auth]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const who = tab === 'staff' ? pick?.email : email.trim();
    if (!who || !secret) return;
    setBusy(true);
    setMsg(await auth.signIn(who, secret));
    setBusy(false);
    setSecret('');
  }

  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <div className="logo" style={{ padding: 0 }}>Title Brew<small>Operations portal</small></div>
        <Seg label="Sign in as" value={tab} onChange={(v) => { setTab(v); setMsg(null); }} options={[{ v: 'staff', l: 'Staff' }, { v: 'owner', l: 'Owner' }]} />
        {tab === 'staff' ? (
          <>
            <div className="eyebrow">Tap your name</div>
            <div className="names">
              {staff === null && <span className="sub">Loading…</span>}
              {staff?.length === 0 && <span className="sub">No staff added yet. The owner adds staff in Supabase.</span>}
              {staff?.map((s) => (
                <button key={s.email} type="button" className="btn" aria-pressed={pick?.email === s.email} onClick={() => setPick(s)}>
                  {s.name}
                </button>
              ))}
            </div>
            {pick && (
              <label className="eyebrow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                PIN for {pick.name}
                <input className="field pin" type="password" inputMode="numeric" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} autoFocus />
              </label>
            )}
          </>
        ) : (
          <>
            <label className="eyebrow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              Email
              <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="eyebrow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              Password
              <input className="field" type="password" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </label>
          </>
        )}
        {msg && <div className="banner bad">{msg}</div>}
        <button className="btn primary" type="submit" disabled={busy || !secret || (tab === 'staff' ? !pick : !email)}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
