import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { Head, MobileWho, parseNum } from '../components';
import type { Ingredient, LineRole, ModifierEffect, ModifierRule, Receipt, Recipe, RecipeChange, RecipeLine } from '../types';
import { START_MODIFIER_RULES, norm } from '../lib/catalog';
import { importRecipes, isIngredientOnly } from '../lib/importRecipes';
import { startIngredients } from '../data/seed';
import { updateIngredients, updateRecipes, updateRules } from '../lib/recipeUpdate';
import { fmtDubaiTime, fmtShortDate } from '../lib/time';
import { findRule, makeBook, receiptUsage, recipeSentence, ruleSentence, takeawaySentence, type RecipeBook } from '../lib/usage';
import { dayEnd, dayStart, receiptsBetween } from '../lib/useStock';
import { amt, whenText } from './stockParts';

export function Recipes() {
  const { data, me } = useApp();
  const owner = me.role === 'owner';
  const [tab, setTab] = useState<'items' | 'choices' | 'check' | 'changes'>('items');
  const book = useMemo(() => makeBook(data.book.ingredients, data.book.recipes, data.book.modifierRules), [data.book]);
  return (
    <>
      <MobileWho />
      <Head eyebrow="Setup" title="Recipes" sub="What every menu item and every choice uses, in g, ml and pieces. These recipes, not Loyverse, decide stock use." />
      <Starter />
      <NovUpdate />
      <div className="tabs">
        <button className="btn sm" aria-pressed={tab === 'items'} onClick={() => setTab('items')}>Menu items</button>
        <button className="btn sm" aria-pressed={tab === 'choices'} onClick={() => setTab('choices')}>Choices</button>
        <button className="btn sm" aria-pressed={tab === 'check'} onClick={() => setTab('check')}>Check a sale</button>
        <button className="btn sm" aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>Changes</button>
      </div>
      {tab === 'items' && <Items book={book} owner={owner} />}
      {tab === 'choices' && <Choices book={book} owner={owner} />}
      {tab === 'check' && <CheckSale book={book} />}
      {tab === 'changes' && <Changes />}
    </>
  );
}

/** First-time setup: starting ingredients, choice rules and recipes from the Loyverse menu. */
function Starter() {
  const { data, me, store, run } = useApp();
  const [notes, setNotes] = useState<string[]>([]);
  if (me.role !== 'owner') return null;
  const lyIds = new Set(data.book.recipes.map((r) => r.id));
  const missing = data.book.loyverseItems.filter((i) => !lyIds.has(i.id) && !isIngredientOnly(i));
  const needSetup = !data.book.ingredients.length || !data.book.modifierRules.length || !data.book.recipes.length;
  if (!needSetup && !missing.length && !notes.length) return null;
  async function build() {
    await run(async () => {
      if (needSetup) await store.seedStock(startIngredients(), START_MODIFIER_RULES);
      const menu = await store.loyverseMenu();
      const ings = data.book.ingredients.length ? data.book.ingredients : startIngredients();
      const res = importRecipes(menu, ings, `Imported from Loyverse by ${me.name}`);
      const have = new Set(data.book.recipes.map((r) => r.id));
      await store.saveRecipes(res.recipes.filter((r) => !have.has(r.id)));
      setNotes(res.notes);
    }, 'Starting recipes saved.');
  }
  return (
    <div className="banner info" style={{ flexDirection: 'column' }}>
      {(needSetup || missing.length > 0) && (
        <span>
          {needSetup ? <b>Set up recipes. </b> : <b>{missing.length} Loyverse items have no recipe yet. </b>}
          This copies the Loyverse recipes, changes them to g, ml and pieces, and applies your corrections (22 g coffee, no dried orange, and the rest). Recipes you already edited are kept.
        </span>
      )}
      {(needSetup || missing.length > 0) && <div><button className="btn sm primary" onClick={build}>{needSetup ? 'Set up recipes' : 'Add the missing recipes'}</button></div>}
      {notes.map((n, i) => <span key={i}>{n}</span>)}
    </div>
  );
}

/** Owner button: puts Arsen's 9 Nov answers into the live recipes and choice rules. */
function NovUpdate() {
  const { data, me, store, run } = useApp();
  if (me.role !== 'owner' || !data.book.recipes.length) return null;
  const rules = updateRules(data.book.modifierRules, me.name);
  const recipes = updateRecipes(data.book.recipes, me.name);
  const ings = updateIngredients(data.book.ingredients);
  if (!rules.length && !recipes.length && !ings.length) return null;
  return (
    <div className="banner info" style={{ flexDirection: 'column' }}>
      <span>
        <b>Update recipes with your answers. </b>
        This changes {recipes.length} recipes (18 g espresso coffee, 20 g filter, Ethiopia default for Espresso, Long Black and filter, nitro 0.33 cartridge)
        and {rules.length} choices (Extra Shot 18 g, Ethiopia Sidamo filter beans) and hides the Colombia filter beans. You can see every change on the Changes tab.
      </span>
      <div>
        <button className="btn sm primary" onClick={() => run(async () => {
          for (const i of ings) await store.saveIngredient(i);
          for (const r of rules) await store.saveModifierRule(r);
          if (recipes.length) await store.saveRecipes(recipes);
        }, 'Recipes updated.')}>Update now</button>
      </div>
    </div>
  );
}

function Items({ book, owner }: { book: RecipeBook; owner: boolean }) {
  const { data } = useApp();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Recipe | null>(null);
  const list = data.book.recipes.filter((r) => !q || norm(r.itemName).includes(norm(q))).sort((a, b) => a.itemName.localeCompare(b.itemName));
  const noRecipe = data.book.loyverseItems.filter((i) => !book.byId.has(i.id) && !book.byName.has(norm(i.name)) && !isIngredientOnly(i));
  if (edit) return <RecipeEditor recipe={edit} onClose={() => setEdit(null)} />;
  return (
    <>
      <div className="fieldset"><label>Find<input className="field" placeholder="e.g. latte" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      {noRecipe.length > 0 && (
        <div className="banner warn">
          <span><b>In Loyverse with no recipe:</b> {noRecipe.map((i) => i.name).join(', ')}. Sales of these use no stock until a recipe is added.</span>
        </div>
      )}
      <div className="panel">
        <div className="rows">
          {list.map((r) => (
            <div className="r" key={r.id}>
              <div className="t">
                <b style={{ fontWeight: 500 }}>{recipeSentence(r, book)}</b>
                {takeawaySentence(r, book) && <span>{takeawaySentence(r, book)}</span>}
                {r.note && <span style={{ color: 'var(--warn)' }}>{r.note}</span>}
                <span>Changed by {r.updatedBy}, {fmtShortDate(r.updatedAt.slice(0, 10))}</span>
              </div>
              {owner && <button className="btn sm" onClick={() => setEdit(r)}>Change</button>}
            </div>
          ))}
          {!list.length && <p className="sub">No recipes yet.</p>}
        </div>
      </div>
    </>
  );
}

const ROLES: { v: '' | LineRole; l: string }[] = [{ v: '', l: 'Always this' }, { v: 'milk', l: 'Milk: swapped for the milk chosen' }, { v: 'coffee', l: 'Coffee: from the bean chosen' }];

function IngredientSelect({ value, onChange, list }: { value: string; onChange: (v: string) => void; list: Ingredient[] }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose</option>
      {list.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit === 'pcs' ? 'pieces' : i.unit})</option>)}
    </select>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { data, me, store, run } = useApp();
  const [r, setR] = useState<Recipe>(structuredClone(recipe));
  const ings = data.book.ingredients.filter((i) => i.active);
  const pack = ings.filter((i) => /^(cup|lid|straw)/.test(i.id));
  const items = data.book.recipes.filter((x) => x.id !== r.id).map((x) => x.itemName).sort();
  const book = makeBook(data.book.ingredients, data.book.recipes, data.book.modifierRules);
  const setLine = (i: number, p: Partial<RecipeLine>) => setR({ ...r, lines: r.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  return (
    <div className="panel">
      <div className="panel-h"><h2>{r.itemName}</h2><button className="link" onClick={onClose}>Close</button></div>
      <p className="sub" style={{ margin: 0 }}>{recipeSentence(r, book)}</p>
      <div className="eyebrow">Uses</div>
      {r.lines.map((l, i) => (
        <div className="rule-edit" key={i}>
          {l.recipeOf !== undefined ? (
            <label>Part of another recipe
              <select className="field" value={l.recipeOf} onChange={(e) => setLine(i, { recipeOf: e.target.value })}>{items.map((n) => <option key={n}>{n}</option>)}</select>
            </label>
          ) : (
            <label>Ingredient<IngredientSelect list={ings} value={l.ingredientId ?? ''} onChange={(v) => setLine(i, { ingredientId: v })} /></label>
          )}
          <label>{l.recipeOf !== undefined ? 'Share (e.g. 0.1)' : `Amount (${book.ingredients.get(l.ingredientId ?? '')?.unit ?? ''})`}
            <input className="field mono" inputMode="decimal" defaultValue={l.qty} onChange={(e) => setLine(i, { qty: parseNum(e.target.value) ?? 0 })} /></label>
          {l.recipeOf === undefined && (
            <label>Changes with the choice?
              <select className="field" value={l.role ?? ''} onChange={(e) => setLine(i, { role: (e.target.value || undefined) as LineRole | undefined })}>
                {ROLES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select>
            </label>
          )}
          <label><span>&nbsp;</span><button className="btn sm" onClick={() => setR({ ...r, lines: r.lines.filter((_, k) => k !== i) })}>Remove</button></label>
        </div>
      ))}
      <div className="quiet">
        <button className="btn sm" onClick={() => setR({ ...r, lines: [...r.lines, { ingredientId: '', qty: 0 }] })}>Add an ingredient</button>
        <button className="btn sm" onClick={() => setR({ ...r, lines: [...r.lines, { recipeOf: items[0] ?? '', qty: 1 }] })}>Add part of another recipe</button>
      </div>
      <div className="eyebrow">Take-away only</div>
      {r.takeaway.map((p, i) => (
        <div className="rule-edit" key={i}>
          <label>Item<IngredientSelect list={pack} value={p.ingredientId} onChange={(v) => setR({ ...r, takeaway: r.takeaway.map((x, k) => (k === i ? { ...x, ingredientId: v } : x)) })} /></label>
          <label>How many<input className="field mono" inputMode="decimal" defaultValue={p.qty} onChange={(e) => setR({ ...r, takeaway: r.takeaway.map((x, k) => (k === i ? { ...x, qty: parseNum(e.target.value) ?? 0 } : x)) })} /></label>
          <label><span>&nbsp;</span><button className="btn sm" onClick={() => setR({ ...r, takeaway: r.takeaway.filter((_, k) => k !== i) })}>Remove</button></label>
        </div>
      ))}
      <div><button className="btn sm" onClick={() => setR({ ...r, takeaway: [...r.takeaway, { ingredientId: 'cup-8oz', qty: 1 }] })}>Add a cup, lid or straw</button></div>
      <div className="rule-edit">
        <label className="wide">Ignore these choices on this item (comma between)
          <input className="field" defaultValue={r.ignoreGroups.join(', ')} onChange={(e) => setR({ ...r, ignoreGroups: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
        <label className="wide">Note<input className="field" defaultValue={r.note ?? ''} onChange={(e) => setR({ ...r, note: e.target.value || null })} /></label>
      </div>
      <div className="quiet">
        <button className="btn primary sm" onClick={() => run(() => store.saveRecipes([{ ...r, lines: r.lines.filter((l) => l.ingredientId || l.recipeOf), note: clearImportNote(r), updatedBy: me.name, updatedAt: new Date().toISOString() }]), 'Recipe saved.').then((ok) => ok && onClose())}>Save recipe</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function Choices({ book, owner }: { book: RecipeBook; owner: boolean }) {
  const { data, store, today } = useApp();
  const [edit, setEdit] = useState<ModifierRule | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  useEffect(() => {
    receiptsBetween(store, dayStart(today), dayEnd(today)).then((rs) => {
      const seen = new Set<string>();
      for (const r of rs) for (const l of r.lines) for (const m of l.modifiers) if (!findRule(book, m)) seen.add(`${m.group}: ${m.option}`);
      setUnmatched([...seen]);
    }).catch(() => setUnmatched([]));
  }, [store, today, book]);
  if (edit) return <RuleEditor rule={edit} onClose={() => setEdit(null)} />;
  const rules = data.book.modifierRules.slice().sort((a, b) => (a.group + a.option).localeCompare(b.group + b.option));
  return (
    <>
      {unmatched.length > 0 && <div className="banner warn"><span><b>Choices sold today with no rule:</b> {unmatched.join(', ')}. They use nothing extra until a rule is added.</span></div>}
      {owner && <div><button className="btn sm" onClick={() => setEdit({ id: 'mod-' + crypto.randomUUID().slice(0, 8), group: '', option: '', effects: [{ type: 'add', qty: 0 }], note: null, updatedBy: '', updatedAt: '' })}>Add a choice rule</button></div>}
      <div className="panel">
        <div className="rows">
          {rules.map((r) => (
            <div className="r" key={r.id}>
              <div className="t"><b style={{ fontWeight: 500 }}>{ruleSentence(r, book)}</b>{r.note && <span>{r.note}</span>}</div>
              {owner && <button className="btn sm" onClick={() => setEdit(r)}>Change</button>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const EFFECTS: { v: ModifierEffect['type']; l: string }[] = [
  { v: 'milk', l: 'Swap the drink’s milk for' }, { v: 'bean', l: 'Coffee comes from' }, { v: 'add', l: 'Add' },
  { v: 'spread', l: 'Add syrup shared across' }, { v: 'recipeOf', l: 'Use the full recipe of the drink chosen' },
  { v: 'swapCup', l: 'Take-away: use a different cup or lid' }, { v: 'none', l: 'Nothing' },
];

function RuleEditor({ rule, onClose }: { rule: ModifierRule; onClose: () => void }) {
  const { data, me, store, run } = useApp();
  const [r, setR] = useState<ModifierRule>(structuredClone(rule));
  const ings = data.book.ingredients.filter((i) => i.active);
  const book = makeBook(data.book.ingredients, data.book.recipes, data.book.modifierRules);
  const setE = (i: number, e: ModifierEffect) => setR({ ...r, effects: r.effects.map((x, k) => (k === i ? e : x)) });
  return (
    <div className="panel">
      <div className="panel-h"><h2>{r.group || 'New choice rule'}{r.option ? `: ${r.option}` : ''}</h2><button className="link" onClick={onClose}>Close</button></div>
      {r.group && <p className="sub" style={{ margin: 0 }}>{ruleSentence(r, book)}</p>}
      <div className="rule-edit">
        <label>Choice group, as in Loyverse (* = any)<input className="field" value={r.group} onChange={(e) => setR({ ...r, group: e.target.value })} /></label>
        <label>Choice, as in Loyverse (* = any)<input className="field" value={r.option} onChange={(e) => setR({ ...r, option: e.target.value })} /></label>
      </div>
      {r.effects.map((e, i) => (
        <div className="rule-edit" key={i}>
          <label>Does
            <select className="field" value={e.type} onChange={(x) => {
              const t = x.target.value as ModifierEffect['type'];
              setE(i, t === 'milk' || t === 'bean' ? { type: t, ingredientId: '' } : t === 'add' ? { type: 'add', qty: 0 } : t === 'spread' ? { type: 'spread', qty: 10, among: [] } : t === 'swapCup' ? { type: 'swapCup', from: '', to: '' } : { type: t } as ModifierEffect);
            }}>{EFFECTS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
          </label>
          {(e.type === 'milk' || e.type === 'bean') && <label>Ingredient<IngredientSelect list={ings} value={e.ingredientId} onChange={(v) => setE(i, { ...e, ingredientId: v })} /></label>}
          {(e.type === 'add' || e.type === 'spread') && <label>Amount<input className="field mono" inputMode="decimal" defaultValue={e.qty} onChange={(x) => setE(i, { ...e, qty: parseNum(x.target.value) ?? 0 })} /></label>}
          {e.type === 'add' && (
            <>
              <label>Of
                <select className="field" value={e.role ? '@' + e.role : e.byItem ? '@byItem' : e.ingredientId ?? ''} onChange={(x) => {
                  const v = x.target.value;
                  setE(i, v === '@milk' || v === '@coffee' ? { type: 'add', qty: e.qty, role: v.slice(1) as LineRole } : v === '@byItem' ? { type: 'add', qty: e.qty, byItem: e.byItem ?? { '': '' } } : { type: 'add', qty: e.qty, ingredientId: v });
                }}>
                  <option value="">Choose</option>
                  <option value="@milk">The drink's milk (or the milk chosen)</option>
                  <option value="@coffee">Coffee from the bean chosen</option>
                  <option value="@byItem">Depends on the item</option>
                  {ings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              {e.byItem && Object.entries(e.byItem).map(([k, v], j) => (
                <label key={j} className="wide" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>If the item name has
                  <input className="field" style={{ width: 120 }} defaultValue={k} onBlur={(x) => { const next = { ...e.byItem }; delete next[k]; next[x.target.value] = v; setE(i, { ...e, byItem: next }); }} /> use
                  <IngredientSelect list={ings} value={v} onChange={(nv) => setE(i, { ...e, byItem: { ...e.byItem, [k]: nv } })} />
                </label>
              ))}
              {e.byItem && <button className="btn sm" onClick={() => setE(i, { ...e, byItem: { ...e.byItem, '': '' } })}>Add another item</button>}
            </>
          )}
          {e.type === 'spread' && (
            <label className="wide">Shared across
              <span className="quiet">{ings.filter((x) => x.id.startsWith('syrup-')).map((x) => (
                <button key={x.id} type="button" className="btn sm" aria-pressed={e.among.includes(x.id)} onClick={() => setE(i, { ...e, among: e.among.includes(x.id) ? e.among.filter((y) => y !== x.id) : [...e.among, x.id] })}>{x.name}</button>
              ))}</span>
            </label>
          )}
          {e.type === 'swapCup' && (
            <>
              <label>Instead of<IngredientSelect list={ings.filter((x) => /^(cup|lid)/.test(x.id))} value={e.from} onChange={(v) => setE(i, { ...e, from: v })} /></label>
              <label>Use<IngredientSelect list={ings.filter((x) => /^(cup|lid)/.test(x.id))} value={e.to} onChange={(v) => setE(i, { ...e, to: v })} /></label>
            </>
          )}
          <label><span>&nbsp;</span><button className="btn sm" onClick={() => setR({ ...r, effects: r.effects.filter((_, k) => k !== i) })}>Remove</button></label>
        </div>
      ))}
      <div><button className="btn sm" onClick={() => setR({ ...r, effects: [...r.effects, { type: 'add', qty: 0 }] })}>Add another effect</button></div>
      <div className="rule-edit"><label className="wide">Note<input className="field" defaultValue={r.note ?? ''} onChange={(e) => setR({ ...r, note: e.target.value || null })} /></label></div>
      <div className="quiet">
        <button className="btn primary sm" disabled={!r.group || !r.option} onClick={() => run(() => store.saveModifierRule({ ...r, updatedBy: me.name, updatedAt: new Date().toISOString() }), 'Choice rule saved.').then((ok) => ok && onClose())}>Save rule</button>
        <button className="btn sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/** Pick a day and a receipt: shows exactly what each line took from stock and why. */
function CheckSale({ book }: { book: RecipeBook }) {
  const { store, today } = useApp();
  const [day, setDay] = useState(today);
  const [q, setQ] = useState('');
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setReceipts(null);
    receiptsBetween(store, dayStart(day), dayEnd(day)).then(setReceipts).catch(() => setReceipts([]));
  }, [store, day]);
  const usage = useMemo(() => receiptUsage(book, receipts ?? []), [book, receipts]);
  const shown = (receipts ?? []).filter((r) => !q || r.number.includes(q) || r.lines.some((l) => norm(l.itemName + l.modifiers.map((m) => m.option).join('')).includes(norm(q)))).slice().reverse();
  return (
    <>
      <div className="fieldset" style={{ alignItems: 'flex-end' }}>
        <label>Day<input className="field date" type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
        <label>Receipt number or item<input className="field" placeholder="e.g. cappuccino oat" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {receipts === null && <p className="sub">Loading receipts…</p>}
      {receipts?.length === 0 && <p className="sub">No receipts on this day.</p>}
      <div className="items">
        {shown.slice(0, 80).map((r) => {
          const rows = usage.filter((u) => u.receipt === r.number);
          return (
            <div key={r.number} className="item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <button type="button" className="link" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(open === r.number ? null : r.number)}>
                <b>Receipt {r.number}</b> · {fmtDubaiTime(r.at)} · {r.dining ?? 'Dine in'}{r.type === 'REFUND' ? ' · Refund' : ''}{r.cancelled ? ' · Cancelled (ignored)' : ''}
                <span className="why">{r.lines.map((l) => `${l.qty} ${l.itemName}${l.modifiers.length ? ` (${l.modifiers.map((m) => m.option).join(', ')})` : ''}`).join(' · ')}</span>
              </button>
              {open === r.number && rows.map((row) => (
                <div key={row.lineIdx} className="tap-body">
                  <b>{row.qty} × {row.item}{row.choices ? ` with ${row.choices}` : ''}{row.takeaway ? ', take-away' : ''}</b>
                  {row.noRecipe && <p className="sub" style={{ color: 'var(--warn)' }}>No recipe for this item yet, so nothing is taken from stock.</p>}
                  {row.uses.map((u, i) => {
                    const ing = book.ingredients.get(u.ingredientId);
                    return <p key={i} className="sub" style={{ margin: '2px 0' }}><b>{amt(u.qty, ing?.unit ?? '')} {ing?.name ?? u.ingredientId}</b> · {u.why}</p>;
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Changes() {
  const { store, data } = useApp();
  const [list, setList] = useState<RecipeChange[] | null>(null);
  useEffect(() => { store.recipeHistory().then(setList).catch(() => setList([])); }, [store, data.book]);
  const book = makeBook(data.book.ingredients, data.book.recipes, data.book.modifierRules);
  const describe = (c: RecipeChange, v: any) => {
    if (!v) return 'new';
    if (c.kind === 'recipe') return recipeSentence({ id: '', itemName: v.itemName ?? v.item_name, lines: v.lines ?? [], takeaway: [], ignoreGroups: v.ignoreGroups ?? v.ignore_groups ?? [], note: null, updatedBy: '', updatedAt: '' }, book);
    if (c.kind === 'modifier') return ruleSentence({ id: '', group: v.group ?? v.grp, option: v.option ?? v.opt, effects: v.effects ?? [], note: null, updatedBy: '', updatedAt: '' }, book);
    return `${v.name}: counted as "${v.countFrom ?? v.count_from ?? ''}", limit ${v.limitPct ?? v.limit_pct}%`;
  };
  return (
    <div className="panel">
      {list === null && <p className="sub">Loading…</p>}
      {list?.length === 0 && <p className="sub">No changes yet.</p>}
      <div className="rows">
        {list?.map((c) => (
          <div className="r" key={c.id}>
            <div className="t">
              <b>{c.label}</b>
              <span>{whenText(c.changedAt)} by {c.changedBy}</span>
              {c.before != null && <span>Before: {describe(c, c.before)}</span>}
              <span>After: {describe(c, c.after)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The import's "no matching count item" warning goes away once an ingredient is picked. */
function clearImportNote(r: { note: string | null; lines: { ingredientId?: string; recipeOf?: string }[] }): string | null {
  const picked = r.lines.some((l) => l.ingredientId || l.recipeOf);
  return picked && r.note?.startsWith('Sold as a piece, but no matching count item') ? null : r.note;
}
