/**
 * Title Brew staff count page
 * Add this as a NEW script file next to your existing script (do not replace it).
 * It reuses LAYOUT, FIRST_ROW, TZ, REASONS, HIST_SHEET, HIST_COLS and isItemRow from the main script.
 *
 * Run setupStaffPage once to create the Staff and Count Log tabs.
 * Then deploy as a web app: Execute as Me, Who has access Anyone.
 */

const SP_STAFF = 'Staff';
const SP_LOG = 'Count Log';
const SP_AREAS = ['Bar', 'Kitchen', 'Weekly'];
const SP_SESSION_SECONDS = 6 * 60 * 60;   // staff stay signed in for 6 hours
const SP_MAX_FAILS = 10;                  // wrong PINs allowed in 15 minutes

// TEST COPY ONLY: change false to true to switch off the 5pm and 11pm locks while testing.
// Keep it false in the real file.
const SP_TEST_NO_TIME_LOCKS = false;

/* ---------------- One time setup ---------------- */

function setupStaffPage() {
  const ss = SpreadsheetApp.getActive();
  let st = ss.getSheetByName(SP_STAFF);
  if (!st) {
    st = ss.insertSheet(SP_STAFF);
    st.getRange(1, 1, 1, 2).setValues([['Name', 'PIN (4 digits, each person different)']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    st.setFrozenRows(1);
    st.setColumnWidth(1, 160); st.setColumnWidth(2, 260);
    st.getRange('B2:B100').setNumberFormat('@');   // keeps PINs like 0123 as typed
  }
  let log = ss.getSheetByName(SP_LOG);
  if (!log) {
    log = ss.insertSheet(SP_LOG);
    log.getRange(1, 1, 1, 6).setValues([['When', 'Staff', 'Area', 'Shift', 'Boxes changed', 'Items counted after save']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 150); log.setColumnWidth(6, 200);
  }
  ss.toast('Staff and Count Log tabs are ready. Add names and PINs on the Staff tab.', 'Title Brew', 8);
}

/* ---------------- Web page ---------------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Page')
    .setTitle('Title Brew Count')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/* ---------------- Sign in ---------------- */

function spLogin(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('sp_fails') || 0);
  if (fails >= SP_MAX_FAILS) return { ok: false, msg: 'Too many wrong PINs. Wait 15 minutes and try again.' };
  const name = spNameForPin(String(pin || '').trim());
  if (!name) {
    cache.put('sp_fails', String(fails + 1), 900);
    return { ok: false, msg: 'Wrong PIN. Try again.' };
  }
  const token = Utilities.getUuid();
  cache.put('sp_tok_' + token, name, SP_SESSION_SECONDS);
  return { ok: true, token: token, name: name };
}

function spLogout(token) {
  if (token) CacheService.getScriptCache().remove('sp_tok_' + token);
  return true;
}

function spNameForPin(pin) {
  if (!/^\d{4}$/.test(pin)) return '';
  const st = SpreadsheetApp.getActive().getSheetByName(SP_STAFF);
  if (!st || st.getLastRow() < 2) return '';
  const rows = st.getRange(2, 1, st.getLastRow() - 1, 2).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() && String(rows[i][1]).trim() === pin) return String(rows[i][0]).trim();
  }
  return '';
}

// Returns the staff name for a valid session, or '' (also checks they are still on the Staff tab)
function spWho(token) {
  if (!token) return '';
  const name = CacheService.getScriptCache().get('sp_tok_' + token);
  if (!name) return '';
  const st = SpreadsheetApp.getActive().getSheetByName(SP_STAFF);
  const names = st.getRange(2, 1, Math.max(st.getLastRow() - 1, 1), 1).getDisplayValues()
    .map(function (r) { return String(r[0]).trim(); });
  return names.indexOf(name) >= 0 ? name : '';
}

/* ---------------- Shift 2 higher than Shift 1 ---------------- */

const SP_CHECKS = 'Count Checks';
const SP_HIGHER_ANSWERS = ['Shift 1 count mistake', 'Extra stock received'];

// Shift 1 total of an item, from its sheet row (null when Shift 1 was not counted)
function spS1Total(area, kind, r) {
  const L = LAYOUT[area];
  const keys = area === 'Bar' ? ['s1a'] : kind === 'single' ? ['s1a'] : kind === 'newonly' ? ['s1b']
    : kind === 'pair' ? ['s1a', 's1b', 's1c'] : ['s1a', 's1b'];
  const v = keys.map(function (k) { return r[L[k] - 1]; });
  if (v.every(function (x) { return x === '' || x === null; })) return null;
  return v.reduce(function (a, x) { return a + (Number(x) || 0); }, 0);
}

// Shift 2 numbers that make up the total compared with Shift 1
function spS2Keys(area, kind) {
  if (area === 'Bar' || kind === 'single') return ['s2a'];
  if (kind === 'newonly') return ['s2b'];
  if (kind === 'pair') return ['s2a', 's2b', 's2c'];
  return ['s2a', 's2b'];
}

// Items delivered today from yesterday's order: no warning for these
function spExpected() {
  const planned = spPlanned();
  if (typeof dvArrivedToday_ !== 'function') return planned;
  // What staff confirmed in Deliveries wins: arrived means expected, confirmed 0 means it did not come
  const arrived = dvArrivedToday_(spTodayKey());
  const out = {};
  Object.keys(planned).forEach(function (k) { if (!(k in arrived) || arrived[k] > 0) out[k] = true; });
  Object.keys(arrived).forEach(function (k) { if (arrived[k] > 0) out[k] = true; });
  return out;
}

// Items ordered yesterday (delivered today)
function spPlanned() {
  const props = PropertiesService.getScriptProperties();
  const yKey = spBizKey(new Date(Date.now() - 86400000));
  try {
    const raw = props.getProperty('ordered_' + yKey);
    if (raw) return JSON.parse(raw);
    const old = JSON.parse(props.getProperty('orderedForNextDay') || '{}');
    if (old.date === yKey) return old.items || {};
  } catch (e) {}
  // Older days: yesterday's orders from the Usage Log
  const ss = SpreadsheetApp.getActive();
  const rules = ss.getSheetByName('Rules');
  const countName = {};
  rules.getRange(5, 1, rules.getLastRow() - 4, 3).getValues().forEach(function (r) { if (r[1]) countName[String(r[1])] = String(r[2]); });
  const out = {};
  const log = ss.getSheetByName('Usage Log');
  if (log && log.getLastRow() >= 2) {
    log.getRange(2, 1, log.getLastRow() - 1, 5).getValues().forEach(function (r) {
      if (r[0] instanceof Date && Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd') === yKey && Number(r[4]) > 0 && countName[String(r[1])]) out[countName[String(r[1])]] = true;
    });
  }
  return out;
}

function spChecksSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SP_CHECKS);
  if (!sh) {
    sh = ss.insertSheet(SP_CHECKS);
    sh.getRange(1, 1, 1, 7).setValues([['When', 'Staff', 'Area', 'Item', 'Shift 1', 'Shift 2', 'Answer']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150); sh.setColumnWidth(4, 200); sh.setColumnWidth(7, 180);
  }
  return sh;
}

// Run once: Count Checks tab, and S1 / S2 headings renamed to Shift 1 / Shift 2
function setupShiftChecks() {
  const ss = SpreadsheetApp.getActive();
  spChecksSheet();
  const ren = { 'S1': 'Shift 1', 'S2': 'Shift 2' };
  ['Bar', 'Kitchen', 'Kitchen Review'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (!sh) return;
    const rng = sh.getRange(1, 1, Math.min(FIRST_ROW, sh.getMaxRows()), sh.getMaxColumns());
    const v = rng.getValues(), f = rng.getFormulas();
    v.forEach(function (row, i) {
      row.forEach(function (x, j) {
        if (f[i][j] || typeof x !== 'string' || !/\bS[12]\b/.test(x)) return;
        sh.getRange(i + 1, j + 1).setValue(x.replace(/\bS([12])\b/g, function (m, d) { return ren['S' + d]; }));
      });
    });
  });
  ss.toast('Count Checks tab is ready and headings now say Shift 1 and Shift 2.', 'Title Brew', 8);
}

/* ---------------- Weekend exceptions ---------------- */

// Not counted at Shift 1 on Saturday and Sunday (they are hidden on the page and not required)
const SP_WEEKEND_S1_SKIP = ['Brazil beans', 'Ethiopia beans'];

function spSkip(area, shift, item) {
  if (area !== 'Bar' || shift !== '1' || SP_WEEKEND_S1_SKIP.indexOf(item) < 0) return false;
  const day = Utilities.formatDate(new Date(Date.now() - 4 * 3600000), TZ, 'u');   // business day: 6 Saturday, 7 Sunday
  return day === '6' || day === '7';
}

/* ---------------- Manager ---------------- */

// Staff tab column C: "Y" marks a manager. Managers are not stopped by the 5pm and night locks.
function spIsManager(name) {
  const st = SpreadsheetApp.getActive().getSheetByName(SP_STAFF);
  if (!st || st.getLastRow() < 2 || st.getMaxColumns() < 3) return false;
  const rows = st.getRange(2, 1, st.getLastRow() - 1, 3).getDisplayValues();
  return rows.some(function (r) { return String(r[0]).trim() === name && /^y(es)?$/i.test(String(r[2]).trim()); });
}

/* ---------------- Time and locks ---------------- */

function spNowHour() { return Number(Utilities.formatDate(new Date(), TZ, 'H')); }
// The business day runs from 4am to 4am (Dubai): at 1am it is still the day of the last shift.
function spBizKey(d) { return Utilities.formatDate(new Date(d.getTime() - 4 * 3600000), TZ, 'yyyy-MM-dd'); }
function spTodayKey() { return spBizKey(new Date()); }

// Night (11pm to 4am): everything view only. After 5pm: Shift 1 and Kitchen expiry dates view only.
function spLocks() {
  if (SP_TEST_NO_TIME_LOCKS) return { night: false, s1: false };
  const h = spNowHour();
  const night = h >= 23 || h < 4;
  return { night: night, s1: night || h >= 17 };
}

// Locks for this person: none for a manager
function spLocksFor(name) {
  const locks = spLocks();
  if (spIsManager(name)) return { night: false, s1: false, manager: true, staff: locks };
  return locks;
}

function spIsLocked(area, shift, locks) {
  if (locks.night) return true;
  if (area === 'Weekly') return false;
  return shift === '1' && locks.s1;
}

/* ---------------- Home screen ---------------- */

function spHome(token) {
  const name = spWho(token);
  if (!name) return { expired: true };
  const ss = SpreadsheetApp.getActive();
  const locks = spLocksFor(name);
  const status = {}, done = {};
  const log = ss.getSheetByName(SP_LOG);
  const today = spTodayKey();
  if (log && log.getLastRow() >= 2) {
    const n = Math.min(log.getLastRow() - 1, 300);
    const rows = log.getRange(log.getLastRow() - n + 1, 1, n, 6).getValues();
    rows.forEach(function (r) {
      if (!(r[0] instanceof Date) || spBizKey(r[0]) !== today) return;
      const key = String(r[2]) + String(r[3]);
      status[key] = r[1] + ' saved at ' + Utilities.formatDate(r[0], TZ, 'h:mma').toLowerCase() + ', ' + r[5];
      const m = String(r[5]).match(/(\d+)\s+of\s+(\d+)/);
      done[key] = { by: String(r[1]), at: Utilities.formatDate(r[0], TZ, 'h:mma').toLowerCase(),
        counted: m ? Number(m[1]) : 0, total: m ? Number(m[2]) : 0 };
    });
  }
  const wd = ss.getSheetByName('Weekly').getRange('C2').getValue();
  status.Weekly = wd instanceof Date ? 'Last count ' + Utilities.formatDate(wd, TZ, 'EEEE d MMMM') : 'Not counted yet';
  if (status.WeeklyW) status.Weekly = status.WeeklyW;
  return {
    name: name,
    today: Utilities.formatDate(new Date(Date.now() - 4 * 3600000), TZ, 'EEEE d MMMM'),
    locks: locks,
    manager: !!locks.manager,
    status: status,
    done: done,
    nowMin: spNowHour() * 60 + Number(Utilities.formatDate(new Date(), TZ, 'm'))
  };
}

/* ---------------- Item setup per area ---------------- */

function spShelfMap() {
  const rules = SpreadsheetApp.getActive().getSheetByName('Rules');
  const rv = rules.getRange(5, 1, rules.getLastRow() - 4, 26).getValues();
  const hasShelf = {};
  rv.forEach(function (r) { if (Number(r[25]) > 0) hasShelf[String(r[2])] = true; });
  return hasShelf;
}

// Kitchen item type, following the same rules as saveDay in the main script
function spKitchenKind(sec, item, hasShelf) {
  if (sec.indexOf('Track') >= 0) return 'single';
  if (sec === 'Croissants') return 'pair';
  if (hasShelf[item]) return 'exp';
  return 'newonly';
}

// Which boxes staff see for an item: key (matches LAYOUT), label, type
function spFields(area, shift, kind) {
  const F = function (key, label, type) { return { key: key, label: label, type: type || 'num' }; };
  if (area === 'Bar') return [F(shift === '1' ? 's1a' : 's2a', 'Count')];
  if (area === 'Weekly') return [F('s1a', 'Count')];
  if (kind === 'single') return [F(shift === '1' ? 's1a' : 's2a', 'Count')];
  // Shift 2: Old / New / Frozen are what is LEFT on the shelf after clearing.
  // Anything thrown away goes in Thrown away today (optional, empty = none), with the reason.
  const thrown = [F('s2t', 'Thrown away', 'opt'), F('rsn', 'Why?', 'sel'), F('note', 'Note', 'text')];
  if (kind === 'newonly') {
    return shift === '1' ? [F('s1b', 'Available')] : [F('s2b', 'Available left')].concat(thrown);
  }
  if (kind === 'pair') {
    return shift === '1' ? [F('s1a', 'Old baked'), F('s1b', 'New baked'), F('s1c', 'Frozen')]
      : [F('s2a', 'Old baked left'), F('s2b', 'New baked left'), F('s2c', 'Frozen left')].concat(thrown);
  }
  return shift === '1' ? [F('s1a', 'Old'), F('s1b', 'New')]
    : [F('s2a', 'Old left'), F('s2b', 'New left')].concat(thrown);
}

function spCol(area, key) {
  const L = LAYOUT[area];
  return L[key] || 0;
}

// Units counted in whole pieces get plus and minus buttons
const SP_PIECE_UNITS = ['pcs', 'cans', 'btls', 'bottles', 'sleeves', 'cartons', 'packets', 'bags', 'rolls', 'packs'];

// A number for the typo check: plain numbers, or the total of "2 old, 24 new" style History text
function spBase(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/\d+(\.\d+)?/g);
  return m ? m.reduce(function (a, x) { return a + Number(x); }, 0) : null;
}

function spShow(v) { return v === '' || v === null ? 'not counted' : String(v); }
function spIso(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : ''; }

// Yesterday's Shift 1 and Shift 2 per item from History
function spHistoryYesterday() {
  const h = SpreadsheetApp.getActive().getSheetByName(HIST_SHEET);
  const y = spBizKey(new Date(Date.now() - 86400000));
  const lastCol = Math.min(h.getLastColumn(), 2 + HIST_COLS * 4);
  const lastRow = h.getLastRow();
  const out = {};
  if (lastCol < 3 || lastRow < 3) return out;
  const top = h.getRange(1, 1, 2, lastCol).getValues();
  let col = -1;
  for (let c = 2; c < lastCol; c++) {
    if (top[1][c] === 'Shift 1' && top[0][c] instanceof Date && Utilities.formatDate(top[0][c], TZ, 'yyyy-MM-dd') === y) { col = c; break; }
  }
  if (col < 0) return out;
  const body = h.getRange(3, 1, lastRow - 2, lastCol).getValues();
  body.forEach(function (r) { if (r[1]) out[String(r[1])] = [r[col], r[col + 1]]; });
  return out;
}

/* ---------------- Load a count screen ---------------- */

function spLoad(token, area, shift) {
  const name = spWho(token);
  if (!name) return { expired: true };
  if (SP_AREAS.indexOf(area) < 0) throw new Error('Unknown area');
  shift = area === 'Weekly' ? '1' : (shift === '2' ? '2' : '1');

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(area);
  const locks = spLocksFor(name);
  const locked = spIsLocked(area, shift, locks);
  const last = sh.getLastRow();
  const vals = last >= FIRST_ROW ? sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 13).getValues() : [];
  const hasShelf = area === 'Kitchen' ? spShelfMap() : {};
  const hist = (area === 'Kitchen' && shift === '1') ? spHistoryYesterday() : {};
  const weeklyDate = area === 'Weekly' ? sh.getRange('C2').getValue() : '';
  const expected = (shift === '2' && area !== 'Weekly') ? spExpected() : {};

  const sections = [];
  let current = null;
  vals.forEach(function (r) {
    if (!isItemRow(r)) return;
    const item = String(r[1]);
    if (spSkip(area, shift, item)) return;
    const sec = String(r[0]);
    if (!current || current.title !== sec) { current = { title: sec, items: [] }; sections.push(current); }
    const g = function (c) { return c ? r[c - 1] : ''; };
    const kind = area === 'Kitchen' ? spKitchenKind(sec, item, hasShelf) : 'single';
    const fields = spFields(area, shift, kind).map(function (f) {
      const v = g(spCol(area, f.key));
      return { key: f.key, label: f.label, type: f.type, value: v === null ? '' : String(v) };
    });

    let ref1 = '', ref2 = '', unit = '', hint = '', base = null, baseLabel = '';
    if (area === 'Bar') {
      unit = String(r[2] || ''); hint = String(r[7] || '');
      if (shift === '1') {
        ref1 = 'Yesterday Shift 1: ' + spShow(r[5]) + '   Shift 2: ' + spShow(r[6]);
        base = spBase(r[6]) !== null ? spBase(r[6]) : spBase(r[5]); baseLabel = 'yesterday';
      } else {
        ref1 = 'Today Shift 1: ' + spShow(r[3]);
        base = spBase(r[3]); baseLabel = 'Shift 1 was';
      }
    } else if (area === 'Weekly') {
      unit = String(r[2] || ''); hint = String(r[4] || '');
      ref1 = 'Last count: ' + spShow(r[3]) + (weeklyDate instanceof Date ? ' on ' + Utilities.formatDate(weeklyDate, TZ, 'd MMM') : '');
      base = spBase(r[3]); baseLabel = 'last count';
      fields[0].value = '';   // weekly is counted fresh each time
    } else {
      if (shift === '1') {
        const hv = hist[item] || ['', ''];
        ref1 = 'Yesterday Shift 1: ' + spShow(hv[0]);
        ref2 = 'Yesterday Shift 2: ' + spShow(hv[1]);
        base = spBase(hv[1]) !== null ? spBase(hv[1]) : spBase(hv[0]); baseLabel = 'yesterday';
      } else {
        const a = g(LAYOUT.Kitchen.s1a), b = g(LAYOUT.Kitchen.s1b), c3 = g(LAYOUT.Kitchen.s1c);
        let t;
        if (kind === 'single') t = spShow(a);
        else if (kind === 'pair') {
          t = (a === '' && b === '' && c3 === '') ? 'not counted'
            : (a === '' ? 0 : a) + ' old, ' + (b === '' ? 0 : b) + ' new, ' + (c3 === '' ? 0 : c3) + ' frozen';
        }
        else if (kind === 'newonly') t = spShow(b);
        else {
          const labs = ['old', 'new'];
          t = (a === '' && b === '') ? 'not counted' : (a === '' ? 0 : a) + ' ' + labs[0] + ', ' + (b === '' ? 0 : b) + ' ' + labs[1];
        }
        ref1 = 'Today Shift 1: ' + t;
        base = kind === 'newonly' ? spBase(b)
          : ((a === '' && b === '' && (kind !== 'pair' || c3 === '')) ? null
            : (Number(a) || 0) + (Number(b) || 0) + (kind === 'pair' ? (Number(c3) || 0) : 0));
        baseLabel = 'Shift 1 was';
      }
    }

    current.items.push({
      name: item, kind: kind,
      cbAsk: area === 'Bar' && item === SP_COLDBREW_ITEM,
      cb: (area === 'Bar' && item === SP_COLDBREW_ITEM) ? spColdBrewGet(spTodayKey(), shift) : '',
      unit: unit, hint: hint, ref1: ref1, ref2: ref2, fields: fields,
      base: base, baseLabel: baseLabel,
      s1Total: (shift === '2' && area !== 'Weekly') ? spS1Total(area, kind, r) : null,
      expected: !!expected[item],
      step: area === 'Kitchen' || SP_PIECE_UNITS.indexOf(unit.toLowerCase()) >= 0,
      showExp: kind === 'exp',
      expOld: spIso(g(LAYOUT.Kitchen.expOld)), expNew: spIso(g(LAYOUT.Kitchen.expNew))
    });
  });

  return {
    name: name, area: area, shift: shift, today: spTodayKey(),
    locked: locked, expLocked: locks.s1, night: locks.night,
    reasons: REASONS,
    sections: sections.filter(function (s) { return s.items.length; })
  };
}

// Old pieces need a reason only when they really go: thrown away balls, old baked croissants,
// or old stock whose expiry is today or earlier. Old desserts still in date can stay.
function spMustClear(kind, expOld) {
  if (kind === 'newonly' || kind === 'pair') return true;
  if (kind === 'exp') return expOld instanceof Date && Utilities.formatDate(expOld, TZ, 'yyyy-MM-dd') <= spTodayKey();
  return false;
}

/* ---------------- Save ---------------- */

// changes: [{item, key, value}] only for boxes the person changed
// coldBrew: 'Yes' or 'Not made' (Bar only, the cold brew question under Ethiopia beans)
function spSave(token, area, shift, changes, answers, coldBrew) {
  const name = spWho(token);
  if (!name) return { expired: true };
  if (SP_AREAS.indexOf(area) < 0) throw new Error('Unknown area');
  shift = area === 'Weekly' ? '1' : (shift === '2' ? '2' : '1');
  const locks = spLocksFor(name);
  if (spIsLocked(area, shift, locks)) {
    return { ok: false, msg: locks.night ? 'Counting is closed until 4am.' : 'Shift 1 is locked after 5pm.' };
  }
  if (!Array.isArray(changes)) changes = [];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(area);
    const last = sh.getLastRow();
    const vals = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 13).getValues();
    const hasShelf = area === 'Kitchen' ? spShelfMap() : {};

    // Where each item lives now, and which boxes this person may change
    const where = {};
    vals.forEach(function (r, i) {
      if (!isItemRow(r)) return;
      const item = String(r[1]);
      if (spSkip(area, shift, item)) return;
      const kind = area === 'Kitchen' ? spKitchenKind(String(r[0]), item, hasShelf) : 'single';
      const allowed = {};
      spFields(area, shift, kind).forEach(function (f) { allowed[f.key] = f.type; });
      if (kind === 'exp' && !locks.s1) { allowed.expOld = 'date'; allowed.expNew = 'date'; }
      where[item] = { row: FIRST_ROW + i, allowed: allowed };
    });

    const cbErr = spColdBrewCheck(area, where, coldBrew);
    if (cbErr) return { ok: false, msg: cbErr };

    // Check everything first, so a bad value saves nothing
    const writes = [];
    const changed = {};
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i] || {};
      const w = where[String(c.item)];
      if (!w) return { ok: false, msg: String(c.item) + ' is no longer on the ' + area + ' tab. Reload the page.' };
      const type = w.allowed[c.key];
      if (!type) continue;
      let v = c.value === null || c.value === undefined ? '' : String(c.value).trim();
      if ((type === 'num' || type === 'opt') && v !== '') {
        v = Number(v.replace(',', '.'));
        if (!isFinite(v) || v < 0) return { ok: false, msg: 'Check the number for ' + c.item + '.' };
      } else if (type === 'sel') {
        if (v !== '' && REASONS.indexOf(v) < 0) v = '';
      } else if (type === 'text') {
        v = v.slice(0, 200);
        if (/^[=+\-@]/.test(v)) v = "'" + v;
      } else if (type === 'date' && v !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, msg: 'Check the date for ' + c.item + '.' };
        v = Utilities.parseDate(v, TZ, 'yyyy-MM-dd');
      }
      writes.push({ row: w.row, col: spCol(area, c.key), value: v });
      changed[String(c.item) + '|' + c.key] = v;
    }

    // Every box must be filled (0 when there is none), and Old leftovers need a reason
    const missing = [], noReason = [], oldBaked = [];
    vals.forEach(function (r) {
      if (!isItemRow(r)) return;
      const item = String(r[1]);
      if (spSkip(area, shift, item)) return;
      const kind = area === 'Kitchen' ? spKitchenKind(String(r[0]), item, hasShelf) : 'single';
      const now = function (key) {
        const ck = item + '|' + key;
        if (ck in changed) return changed[ck];
        if (area === 'Weekly') return '';
        if (!spCol(area, key)) return '';
        const v = r[spCol(area, key) - 1];
        return v === null ? '' : v;
      };
      const fields = spFields(area, shift, kind);
      if (fields.some(function (f) { return f.type === 'num' && now(f.key) === ''; })) missing.push(item);
      // Thrown away today needs a reason
      if (fields.some(function (f) { return f.key === 'rsn'; }) && Number(now('s2t')) > 0 && !now('rsn')) noReason.push(item);
      // Old baked croissants are thrown away at closing: they must be entered under Thrown away, not left as Old baked
      if (shift === '2' && kind === 'pair' && Number(now('s2a')) > 0) oldBaked.push(item);
    });
    if (missing.length) {
      return { ok: false, msg: 'Fill in every box, type 0 when there is none. Still empty: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? ' and ' + (missing.length - 5) + ' more.' : '.') };
    }
    if (noReason.length) return { ok: false, msg: 'Choose why it was thrown away for: ' + noReason.join(', ') + '.' };
    if (oldBaked.length) return { ok: false, msg: 'Old baked croissants are thrown away at closing. Put them under Thrown away and set Old baked left to 0: ' + oldBaked.join(', ') + '.' };

    // Shift 2 higher than Shift 1 (not for items delivered today): an answer is required
    const higher = [];
    const ans = {};
    (Array.isArray(answers) ? answers : []).forEach(function (a) {
      if (!a || SP_HIGHER_ANSWERS.indexOf(String(a.answer)) < 0) return;
      // A Shift 1 mistake only counts when this person confirms their own Shift 2 count
      if (String(a.answer) === SP_HIGHER_ANSWERS[0]) {
        if (a.confirmed === true) ans[String(a.item)] = 'Shift 1 count mistake. Shift 2 count rechecked and confirmed';
      } else {
        ans[String(a.item)] = String(a.answer);
      }
    });
    if (shift === '2' && area !== 'Weekly') {
      const expected = spExpected();
      vals.forEach(function (r) {
        if (!isItemRow(r)) return;
        const item = String(r[1]);
        if (expected[item]) return;
        const kind = area === 'Kitchen' ? spKitchenKind(String(r[0]), item, hasShelf) : 'single';
        const keys = spS2Keys(area, kind);
        if (!keys.some(function (k) { return (item + '|' + k) in changed; })) return;   // only what was counted now
        const s1 = spS1Total(area, kind, r);
        if (s1 === null) return;
        const s2 = keys.reduce(function (a, k) {
          const ck = item + '|' + k;
          const v = ck in changed ? changed[ck] : r[spCol(area, k) - 1];
          return a + (Number(v) || 0);
        }, 0);
        if (s2 > s1 + 1e-9) higher.push({ item: item, s1: s1, s2: s2 });
      });
      const unanswered = higher.filter(function (x) { return !ans[x.item]; });
      if (unanswered.length) {
        return { ok: false, msg: 'Shift 2 is higher than Shift 1 for: ' + unanswered.map(function (x) { return x.item; }).join(', ') + '. Choose what happened, and confirm your count if Shift 1 made a mistake.' };
      }
    }

    spColdBrewSave(area, where, shift, name, coldBrew);
    writes.forEach(function (w) { sh.getRange(w.row, w.col).setValue(w.value); });
    if (area === 'Weekly' && writes.length) {
      // Same value as the count date on Bar, so Today's Orders sees the weekly count as done today
      sh.getRange('C2').setValue(ss.getSheetByName('Bar').getRange('C2').getValue());
    }
    SpreadsheetApp.flush();

    // How many items are now fully counted for this shift
    const after = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 13).getValues();
    let total = 0, counted = 0;
    after.forEach(function (r) {
      if (!isItemRow(r)) return;
      if (spSkip(area, shift, String(r[1]))) return;
      const kind = area === 'Kitchen' ? spKitchenKind(String(r[0]), String(r[1]), hasShelf) : 'single';
      const nums = spFields(area, shift, kind).filter(function (f) { return f.type === 'num'; });
      total++;
      if (nums.every(function (f) { const v = r[spCol(area, f.key) - 1]; return v !== '' && v !== null; })) counted++;
    });

    if (higher.length) {
      const ch = spChecksSheet();
      const now = new Date();
      ch.getRange(ch.getLastRow() + 1, 1, higher.length, 7).setValues(higher.map(function (x) {
        return [now, name, area, x.item, x.s1, x.s2, ans[x.item]];
      }));
      ch.getRange(2, 1, ch.getLastRow() - 1, 1).setNumberFormat('ddd d mmm, h:mm am/pm');
    }

    const log = ss.getSheetByName(SP_LOG);
    if (log) {
      // A manager saving when staff would be locked out is marked in the log
      const who = locks.manager && spIsLocked(area, shift, locks.staff) ? name + ' (manager, after lock)' : name;
      log.appendRow([new Date(), who, area, area === 'Weekly' ? 'W' : shift, writes.length, counted + ' of ' + total]);
      log.getRange(log.getLastRow(), 1).setNumberFormat('ddd d mmm, h:mm am/pm');
    }
    return { ok: true, changed: writes.length, counted: counted, total: total };
  } finally {
    lock.releaseLock();
  }
}
