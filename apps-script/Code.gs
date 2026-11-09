/**
 * Title Brew daily ordering script
 * 5pm: saves the day to History, locks Shift 1 columns for staff, logs usage and learns daily use.
 * 11pm: saves the day again with Shift 2 and clearance, adds today's clearances to the Clearance Log tab, and updates the waste totals on Kitchen Review.
 * 4am: unlocks Shift 1, clears Bar, Kitchen and Your change, and fills in the new expiry dates.
 * Paste everything into Extensions > Apps Script, save, choose "setup" in the dropdown and click Run.
 *
 * Croissants: Old baked (baked yesterday, cleared at 9pm), New baked (baked today, kept) and Frozen.
 * Frozen croissants are in Kitchen columns K (Shift 1) and L (Shift 2).
 * Run upgradeCroissants once to set up columns K and L and update the croissant formulas.
 */

const HIST_SHEET = 'History';
const FIRST_ROW = 8;   // first item row on Bar, Kitchen and Weekly
const TZ = 'Asia/Dubai';
const LOCK_NAME = 'Shift 1 lock';
const HIST_COLS = 4;   // per day: Shift 1, Shift 2, Expiry, Cleared
const REASONS = ['Expired', 'Damaged', 'Not sold'];

// Column numbers on each count tab (A = 1, 0 = not used)
// s1c / s2c: third count, used by croissants only (Frozen)
const LAYOUT = {
  Bar:     { s1a: 4, s1b: 0, s1c: 0, s2a: 5, s2b: 0, s2c: 0, expOld: 0, expNew: 0, rsn: 0, note: 0, clear: [4, 5], lock: [4, 4], lock2: null },
  Kitchen: { s1a: 5, s1b: 6, s1c: 11, s2a: 7, s2b: 9, s2c: 12, expOld: 3, expNew: 4, rsn: 8, note: 10, clear: [3, 12], lock: [3, 6], lock2: [11, 11] },
  Weekly:  { s1a: 4, s1b: 0, s1c: 0, s2a: 0, s2b: 0, s2c: 0, expOld: 0, expNew: 0, rsn: 0, note: 0, clear: null, lock: null, lock2: null }
};

function onOpen() {
  portalBridgeAddMenu();
  SpreadsheetApp.getUi().createMenu('Title Brew')
    .addItem('Create Bakery email with LPO attached', 'draftBakeryEmail')
    .addSeparator()
    .addItem('Shift 1 counted late: save it now (History, usage, lock)', 'saveShift1')
    .addItem('Shift 2 counted late: save it now (History, clearances, waste)', 'saveShift2')
    .addSeparator()
    .addItem('Save today to History', 'saveDay')
    .addItem('Lock Shift 1 now', 'lockShift1')
    .addItem('Unlock Shift 1', 'unlockShift1')
    .addItem('Start new day now (clear and fill expiry)', 'clearCount')
    .addItem('Recalculate learned usage', 'learnUsage')
    .addItem('Update waste totals', 'updateWaste')
    .addItem("Add today's clearances to Clearance Log", 'logClearanceNow')
    .addSeparator()
    .addItem('Set up automatic saving (run once)', 'setup')
    .addToUi();
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('saveShift1').timeBased().everyDays(1).atHour(17).nearMinute(0).inTimezone(TZ).create();
  ScriptApp.newTrigger('saveShift2').timeBased().everyDays(1).atHour(23).nearMinute(0).inTimezone(TZ).create();
  ScriptApp.newTrigger('clearCount').timeBased().everyDays(1).atHour(4).nearMinute(0).inTimezone(TZ).create();
  ScriptApp.newTrigger('onOrderTick').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  setupOrderTicks();
  SpreadsheetApp.getActive().toast('Automatic saving is on: 5pm save and lock, 11pm save, 4am new day. Order tick boxes are ready.', 'Title Brew', 8);
}

/* ---------------- Order email tick boxes (work on the phone app too) ---------------- */

const TICK_SHEET = "Today's Orders";
const TICK_SUPPLIERS = ['Almarai', 'The Bakery'];
const TICK_HINT = 'Tick the box to create the Gmail draft';

// Finds each supplier block on Today's Orders: its header row, item rows, Message row and Email row
function orderBlocks() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TICK_SHEET);
  const a = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); });
  const out = {};
  TICK_SUPPLIERS.forEach(function (name) {
    const head = a.indexOf(name);
    if (head < 0 || a[head + 1] !== 'Item') return;
    let msg = -1, email = -1;
    for (let i = head + 2; i < a.length && i < head + 40; i++) {
      if (a[i] === 'Message' && msg < 0) msg = i;
      if (a[i] === 'Email') { email = i; break; }
    }
    if (msg < 0 || email < 0) return;
    out[name] = { first: head + 3, last: msg, msg: msg + 1, email: email + 1 };   // 1-based rows; items are first..last
  });
  return out;
}

// Puts a tick box where "Open email draft" was, for Almarai and The Bakery
function setupOrderTicks() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TICK_SHEET);
  // Remove the earlier tick box at the top, if it is there
  if (String(sh.getRange('A6').getValue()) === 'Bakery email') {
    sh.getRange('A6:C6').clearContent().clearDataValidations().setFontWeight('normal').setFontColor(null);
  }
  const blocks = orderBlocks();
  Object.keys(blocks).forEach(function (name) {
    const row = blocks[name].email;
    sh.getRange(row, 2).clearContent().insertCheckboxes().setValue(false);
    sh.getRange(row, 4).setValue(TICK_HINT).setFontColor('#666666');
  });
}

// Runs on every edit; only acts when an order tick box is ticked
function onOrderTick(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== TICK_SHEET || e.range.getColumn() !== 2 || e.range.getNumRows() !== 1) return;
  if (e.range.getValue() !== true) return;
  const blocks = orderBlocks();
  const name = Object.keys(blocks).filter(function (n) { return blocks[n].email === e.range.getRow(); })[0];
  if (!name) return;
  const status = sh.getRange(e.range.getRow(), 4);
  status.setValue('Creating the draft, wait a few seconds...').setFontColor('#666666');
  SpreadsheetApp.flush();
  try {
    const b = blocks[name];
    const finals = sh.getRange(b.first, 6, b.last - b.first + 1, 1).getValues();
    if (!finals.some(function (r) { return Number(r[0]) > 0; })) throw new Error('nothing to order today');
    let extra = '';
    if (name === 'The Bakery') {
      const lpoNo = draftBakeryEmail();
      extra = ' with LPO ' + lpoNo;
      // Note next to the LPO number (row below the tick box): when this number was last used
      const lpoRow = b.email + 1;
      if (String(sh.getRange(lpoRow, 1).getValue()).toLowerCase().indexOf('lpo') >= 0) {
        sh.getRange(lpoRow, 3).setValue('LPO ' + lpoNo + ' last used on ' +
          Utilities.formatDate(new Date(), TZ, 'EEE d MMM') + '. Change the number after this order is sent.').setFontColor('#666666');
      }
    }
    else draftSupplierEmail(name, String(sh.getRange(b.msg, 2).getDisplayValue()));
    status.setValue('Draft ready in Gmail at ' + Utilities.formatDate(new Date(), TZ, 'h:mma').toLowerCase() + extra +
      '. Open Gmail, check it and press Send.').setFontColor('#2D6A4F');
  } catch (err) {
    status.setValue('No draft: ' + err.message).setFontColor('#B42318');
  }
  e.range.setValue(false);
}

// Kept so the earlier trigger name still works until setup is run again
function onBakeryTick(e) { onOrderTick(e); }

// Plain email draft (no attachment) to a supplier on the Suppliers tab
function draftSupplierEmail(name, body) {
  const ss = SpreadsheetApp.getActive();
  const sup = ss.getSheetByName('Suppliers');
  const sv = sup.getRange(5, 1, sup.getLastRow() - 4, 3).getValues();
  const row = sv.filter(function (r) { return String(r[0]) === name; })[0];
  if (!row || !String(row[2]).trim()) throw new Error(name + ' has no email on the Suppliers tab.');
  const to = String(row[2]).replace(/[\s;]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '');
  const delivery = ss.getSheetByName("Today's Orders").getRange('B3').getValue();
  const subject = 'Order. Title Brew for ' + Utilities.formatDate(delivery, TZ, 'd MMMM');
  GmailApp.createDraft(to, subject, body);
}

function sameDay(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return Utilities.formatDate(a, TZ, 'yyyyMMdd') === Utilities.formatDate(b, TZ, 'yyyyMMdd');
}

// Item rows have a section name like 'Bar' in column A; section header rows are in capitals
function isItemRow(r) { return r[0] && r[1] && String(r[0]) !== String(r[0]).toUpperCase(); }

function num(v) { return v === '' || v === null ? 0 : v; }
function fmtDate(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'd MMM') : ''; }

function blankRow() { const r = []; for (let i = 0; i < HIST_COLS; i++) r.push(''); return r; }

function saveShift1() {
  const date = saveDay();
  saveOrdered(date);
  lockShift1();
  logUsage(date);
  learnUsage();
  ordersForDeliveries();
  if (typeof portalBridgeSend === 'function') portalBridgeSend();
}

function saveShift2() {
  const date = saveDay();
  saveOrdered(date);
  logClearance(date);
  updateWaste();
  ordersForDeliveries();
  if (typeof portalBridgeSend === 'function') portalBridgeSend();
}

// Saves today's orders for tomorrow's Deliveries screen. Runs on its own, so it works
// even when the portal settings are missing (the portal bridge also calls it; doing it twice is harmless).
function ordersForDeliveries() {
  if (typeof deliveriesSnapshotOrders_ !== 'function') return;
  try { deliveriesSnapshotOrders_(); } catch (e) { Logger.log('Deliveries snapshot: ' + e); }
}

// Saves Bar, Kitchen and Weekly for today into History (re-saving the same day overwrites it)
function saveDay() {
  const ss = SpreadsheetApp.getActive();
  const h = ss.getSheetByName(HIST_SHEET);
  const date = ss.getSheetByName('Bar').getRange('C2').getValue();
  const weeklyToday = sameDay(ss.getSheetByName('Weekly').getRange('C2').getValue(), date);

  const lastH = Math.max(h.getLastRow(), 3);
  const names = h.getRange(3, 2, lastH - 2, 1).getValues().map(function (r) { return String(r[0]); });
  const data = {};

  // Kitchen items with a shelf life keep old / new; others (like the balls) are saved as one number
  const rules = ss.getSheetByName('Rules');
  const rv = rules.getRange(5, 1, rules.getLastRow() - 4, 26).getValues();
  const hasShelf = {};
  rv.forEach(function (r) { if (Number(r[25]) > 0) hasShelf[String(r[2])] = true; });

  Object.keys(LAYOUT).forEach(function (sheetName) {
    const sh = ss.getSheetByName(sheetName);
    const L = LAYOUT[sheetName];
    const last = sh.getLastRow();
    if (last < FIRST_ROW) return;
    const vals = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 14).getValues();
    vals.forEach(function (r) {
      const item = String(r[1]);
      if (!isItemRow(r)) return;
      const g = function (c) { return c ? r[c - 1] : ''; };
      let row = blankRow();
      if (!(sheetName === 'Weekly' && !weeklyToday)) {
        const sec = String(r[0]);
        const cleared = function () {
          const reason = String(g(L.rsn));
          const parts = [];
          if (REASONS.indexOf(reason) >= 0) parts.push(num(g(L.s2a)) + ' ' + reason.toLowerCase());
          if (g(L.note)) parts.push(String(g(L.note)));
          return parts.join('; ');
        };
        if (L.s1b && sec === 'Croissants') {
          const three = function (a, b, c) {
            return (a === '' && b === '' && c === '') ? '' : num(a) + ' old, ' + num(b) + ' new, ' + num(c) + ' frozen';
          };
          row = [three(g(L.s1a), g(L.s1b), g(L.s1c)), three(g(L.s2a), g(L.s2b), g(L.s2c)), '', cleared()];
        } else if (L.s1b && sec.indexOf('Track') < 0 && !hasShelf[item]) {
          const sum = function (a, b) { return (a === '' && b === '') ? '' : num(a) + num(b); };
          row = [sum(g(L.s1a), g(L.s1b)), g(L.s2b), '', cleared()];   // Shift 2 Old is only used for thrown away pieces
        } else if (L.s1b && sec.indexOf('Track') < 0) {
          const pair = function (a, b) { return (a === '' && b === '') ? '' : num(a) + ' old, ' + num(b) + ' new'; };
          const ex = (g(L.expOld) || g(L.expNew)) ? fmtDate(g(L.expOld)) + ' / ' + fmtDate(g(L.expNew)) : '';
          row = [pair(g(L.s1a), g(L.s1b)), pair(g(L.s2a), g(L.s2b)), ex, cleared()];
        } else {
          row = [g(L.s1a), g(L.s2a), '', ''];
        }
      }
      data[item] = row;
      if (names.indexOf(item) < 0) {
        names.push(item);
        h.getRange(names.length + 2, 1, 1, 2).setValues([[sheetName, item]]);
      }
    });
  });

  if (!sameDay(h.getRange(1, 3).getValue(), date)) {
    h.insertColumnsBefore(3, HIST_COLS);
    const d = []; for (let i = 0; i < HIST_COLS; i++) d.push(date);
    h.getRange(1, 3, 1, HIST_COLS).setValues([d]).setNumberFormat('ddd d mmm').setFontWeight('bold').setFontColor('#999999');
    h.getRange(1, 3).setFontColor('#000000');
    h.getRange(2, 3, 1, HIST_COLS).setValues([['Shift 1', 'Shift 2', 'Expiry', 'Cleared']]).setFontColor('#666666').setFontWeight('bold');
    h.getRange(1, 6, h.getMaxRows(), 1).setBorder(null, null, null, true, null, null);
  }
  const out = names.map(function (n) { return data[n] || blankRow(); });
  h.getRange(3, 3, out.length, HIST_COLS).setValues(out);
  h.getRange(3, 5, out.length, 1).setFontColor('#999999');
  return date;
}

// Staff cannot edit Shift 1 columns after this; the owner always can
function lockShift1() {
  const ss = SpreadsheetApp.getActive();
  unlockShift1();
  const me = Session.getEffectiveUser();
  ['Bar', 'Kitchen'].forEach(function (sheetName) {
    const L = LAYOUT[sheetName];
    const sh = ss.getSheetByName(sheetName);
    const last = sh.getLastRow();
    [L.lock, L.lock2].forEach(function (lk) {
      if (!lk) return;
      const p = sh.getRange(FIRST_ROW, lk[0], last - FIRST_ROW + 1, lk[1] - lk[0] + 1).protect();
      p.setDescription(LOCK_NAME);
      p.addEditor(me);
      p.removeEditors(p.getEditors());
      if (p.canDomainEdit()) p.setDomainEdit(false);
    });
  });
}

function unlockShift1() {
  SpreadsheetApp.getActive().getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === LOCK_NAME) p.remove();
  });
}

// Remembers which counted items were ordered today (Final order above 0), so the 4am reset knows
// what is delivered. Saved at 5pm and again at 11pm, in case Your change was edited after 5pm.
function orderedNow() {
  const ss = SpreadsheetApp.getActive();
  const rules = ss.getSheetByName('Rules');
  const to = ss.getSheetByName("Today's Orders");
  const rv = rules.getRange(5, 1, rules.getLastRow() - 4, 3).getValues();
  const countName = {};
  rv.forEach(function (r) { if (r[1]) countName[String(r[1])] = String(r[2]); });
  const tv = to.getRange(1, 1, to.getLastRow(), 17).getValues();
  const ordered = {};
  tv.forEach(function (r) {
    if (!r[16]) return;                       // column Q holds the rule on item rows only
    const cn = countName[String(r[0])];
    if (cn && Number(r[5]) > 0) ordered[cn] = true;
  });
  return ordered;
}

function saveOrdered(date) {
  const props = PropertiesService.getScriptProperties();
  const key = Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
  props.setProperty('ordered_' + key, JSON.stringify(orderedNow()));
  // Keep two weeks
  const limit = Utilities.formatDate(new Date(date.getTime() - 14 * 86400000), TZ, 'yyyy-MM-dd');
  props.getKeys().forEach(function (k) { if (k.indexOf('ordered_') === 0 && k.slice(8) < limit) props.deleteProperty(k); });
}

// New day: unlock, clear Bar and Kitchen, clear Your change, fill in expiry dates. Weekly is kept.
function clearCount() {
  const ss = SpreadsheetApp.getActive();
  const to = ss.getSheetByName("Today's Orders");
  const rules = ss.getSheetByName('Rules');
  const kit = ss.getSheetByName('Kitchen');

  // 1. What was ordered yesterday, per counted item, and each item's shelf life
  const rv = rules.getRange(5, 1, rules.getLastRow() - 4, 26).getValues();
  const countName = {}, shelf = {};
  rv.forEach(function (r) {
    if (!r[1]) return;
    countName[String(r[1])] = String(r[2]);
    if (Number(r[25]) > 0) shelf[String(r[2])] = Number(r[25]);
  });
  const tv = to.getRange(1, 1, to.getLastRow(), 17).getValues();
  const yourChangeRows = [];
  tv.forEach(function (r, i) { if (r[16]) yourChangeRows.push(i + 1); });

  // What was ordered yesterday: saved at 5pm / 11pm. (At 4am Today's Orders already shows
  // the new day, so it cannot be used, for example on Saturday it shows no orders at all.)
  const todayDate = ss.getSheetByName('Bar').getRange('C2').getValue();
  const yKey = todayDate instanceof Date ? Utilities.formatDate(new Date(todayDate.getTime() - 86400000), TZ, 'yyyy-MM-dd') : '';
  let ordered = {};
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty('ordered_' + yKey);
    if (raw) ordered = JSON.parse(raw);
    else {
      const old = JSON.parse(props.getProperty('orderedForNextDay') || '{}');
      ordered = old.date === yKey ? (old.items || {}) : orderedNow();
    }
  } catch (e) { ordered = orderedNow(); }

  // 2. Yesterday's expiry dates and closing (Shift 2) counts on Kitchen
  const kLast = kit.getLastRow();
  const kv = kit.getRange(FIRST_ROW, 1, kLast - FIRST_ROW + 1, 9).getValues();

  // 3. Unlock and clear
  unlockShift1();
  ['Bar', 'Kitchen'].forEach(function (sheetName) {
    const L = LAYOUT[sheetName];
    const sh = ss.getSheetByName(sheetName);
    const last = sh.getLastRow();
    const rows = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 2).getValues();
    rows.forEach(function (r, k) {
      if (isItemRow(r)) sh.getRange(FIRST_ROW + k, L.clear[0], 1, L.clear[1] - L.clear[0] + 1).clearContent();
    });
  });
  yourChangeRows.forEach(function (row) { to.getRange(row, 5).clearContent(); });
  SpreadsheetApp.flush();

  // 4. Fill in today's expiry dates
  const today = ss.getSheetByName('Bar').getRange('C2').getValue();
  if (!(today instanceof Date)) return;
  const todayKey = Utilities.formatDate(today, TZ, 'yyyy-MM-dd');
  // A date that has already passed means nothing is left of that batch
  const live = function (d) { return d instanceof Date && Utilities.formatDate(d, TZ, 'yyyy-MM-dd') >= todayKey ? d : ''; };
  kv.forEach(function (r, k) {
    const item = String(r[1]);
    if (!isItemRow(r) || !shelf[item]) return;
    const yOld = r[2] instanceof Date ? r[2] : '';
    const yNew = r[3] instanceof Date ? r[3] : '';
    const s2Old = r[6], s2New = r[8];                 // last night's closing count
    const counted = s2Old !== '' || s2New !== '';
    const leftOld = Number(s2Old) > 0, leftNew = Number(s2New) > 0;

    // Which batch is still on the shelf this morning
    let carry;
    if (counted) carry = leftNew ? yNew : (leftOld ? yOld : '');
    else carry = yNew || yOld;

    let newOld, newNew;
    if (ordered[item]) {
      // New delivery today: what is left becomes Old, the delivery is New
      newOld = live(carry);
      newNew = new Date(today.getTime() + (shelf[item] - 1) * 86400000);
    } else if (shelf[item] <= 2) {
      // Short life item, no delivery: what is left becomes Old, no New batch
      newOld = live(carry);
      newNew = '';
    } else if (counted) {
      // Longer life item, no delivery: keep the batches that still have pieces
      newOld = leftOld ? live(yOld) : '';
      newNew = leftNew ? yNew : '';
    } else {
      newOld = yOld; newNew = yNew;
    }
    kit.getRange(FIRST_ROW + k, 3, 1, 2).setValues([[newOld, newNew]]);
  });
}

// Run once. Sets up Kitchen columns K and L for frozen croissants, moves today's frozen numbers there,
// and updates the croissant formulas on Today's Orders and Kitchen Review. Safe to run again: it stops if already done.
function upgradeCroissants() {
  const ss = SpreadsheetApp.getActive();
  const kit = ss.getSheetByName('Kitchen');
  if (['S1 Frozen', 'Shift 1 Frozen'].indexOf(String(kit.getRange('K6').getValue())) >= 0) {
    ss.toast('Croissant columns are already set up.', 'Title Brew', 6);
    return;
  }
  const last = kit.getLastRow();

  // 1. Columns K and L: same look as the Shift 1 and Shift 2 count columns (headers and croissant rows only)
  const paint = function (row) {
    kit.getRange(row, 6).copyTo(kit.getRange(row, 11), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    kit.getRange(row, 9).copyTo(kit.getRange(row, 12), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  };
  [5, 6, 7].forEach(paint);
  kit.setColumnWidth(11, kit.getColumnWidth(6));
  kit.setColumnWidth(12, kit.getColumnWidth(9));
  kit.getRange('K5').setValue('FROZEN (croissants)');
  kit.getRange('K6:L6').setValues([['Shift 1 Frozen', 'Shift 2 Frozen']]);

  // 2. Croissant rows: header labels, and move today's frozen numbers from F and I to K and L
  const vals = kit.getRange(1, 1, last, 12).getValues();
  const croissants = [];
  vals.forEach(function (r, i) {
    const row = i + 1;
    if (String(r[0]) === 'CROISSANTS') {
      kit.getRange(row, 5, 1, 8).setValues([['Old baked', 'New baked', 'Old baked', 'Cleared?', 'New baked', 'Note', 'Shift 1 Frozen', 'Shift 2 Frozen']]);
    }
    if (row >= FIRST_ROW && String(r[0]) === 'Croissants' && r[1]) {
      croissants.push({ name: String(r[1]), row: row });
      paint(row);
      kit.getRange(row, 11, 1, 2).setValues([[r[5], r[8]]]);
      kit.getRange(row, 6).clearContent();
      kit.getRange(row, 9).clearContent();
    }
  });
  const names = croissants.map(function (c) { return c.name; });

  // 3. Today's Orders: croissant count = Old baked + New baked + Frozen
  const to = ss.getSheetByName("Today's Orders");
  const rules = ss.getSheetByName('Rules');
  const tf = to.getRange(1, 2, to.getLastRow(), 1).getFormulas();
  tf.forEach(function (f, i) {
    const m = String(f[0]).match(/Rules!\$C\$(\d+)/);
    if (!m || String(f[0]).indexOf('Kitchen!') < 0) return;
    const rr = Number(m[1]);
    if (names.indexOf(String(rules.getRange(rr, 3).getValue())) < 0) return;
    const match = 'MATCH(Rules!$C$' + rr + ',Kitchen!$B$1:$B$300,0)';
    const g = function (c) { return 'INDEX(Kitchen!$' + c + '$1:$' + c + '$300,' + match + ')'; };
    to.getRange(i + 1, 2).setFormula('=IFERROR(IF(AND(' + g('E') + '="",' + g('F') + '="",' + g('K') + '=""),"",N(' + g('E') + ')+N(' + g('F') + ')+N(' + g('K') + ')),"")');
  });

  // 4. Kitchen Review: today shows old / new / frozen for croissants
  const kr = ss.getSheetByName('Kitchen Review');
  const ka = kr.getRange(1, 1, kr.getLastRow(), 1).getValues();
  ka.forEach(function (r, i) {
    const c = croissants.filter(function (x) { return x.name === String(r[0]); })[0];
    if (!c) return;
    const k = c.row;
    kr.getRange(i + 1, 2, 1, 2).setFormulas([[
      '=IF(AND(Kitchen!E' + k + '="",Kitchen!F' + k + '="",Kitchen!K' + k + '=""),"",N(Kitchen!E' + k + ')&" / "&N(Kitchen!F' + k + ')&" / "&N(Kitchen!K' + k + '))',
      '=IF(AND(Kitchen!G' + k + '="",Kitchen!I' + k + '="",Kitchen!L' + k + '=""),"",N(Kitchen!G' + k + ')&" / "&N(Kitchen!I' + k + ')&" / "&N(Kitchen!L' + k + '))'
    ]]);
  });
  kr.getRange('A3').setValue('For reading only. Today shows old / new (croissants old baked / new baked / frozen). Thrown away totals are updated by the script every night at 11pm.');

  ss.toast('Croissants now use Old baked, New baked and Frozen.', 'Title Brew', 8);
}

// Makes a Gmail draft to The Bakery with the LPO tab attached as an Excel file.
// You open Gmail, check the draft and press Send.
function draftBakeryEmail() {
  const ss = SpreadsheetApp.getActive();
  const lpo = ss.getSheetByName('LPO');
  const lpoNo = ss.getSheetByName('Rules').getRange('C2').getValue();
  const count = ss.getSheetByName('Bar').getRange('C2').getValue();
  const delivery = new Date(count.getTime() + 86400000);
  const friday = Utilities.formatDate(count, TZ, 'u') === '5';

  // Recipients from the Suppliers tab
  const sup = ss.getSheetByName('Suppliers');
  const sv = sup.getRange(5, 1, sup.getLastRow() - 4, 3).getValues();
  const row = sv.filter(function (r) { return String(r[0]) === 'The Bakery'; })[0];
  if (!row) throw new Error('The Bakery was not found on the Suppliers tab.');
  const to = String(row[2]);

  // Copy the LPO into a temporary file with plain values, export it as Excel, then remove the temporary file
  const tmp = SpreadsheetApp.create('Title Brew LPO temp');
  const copy = lpo.copyTo(tmp).setName('LPO');
  const range = lpo.getDataRange();
  copy.getRange(1, 1, range.getNumRows(), range.getNumColumns()).setValues(range.getValues());
  tmp.deleteSheet(tmp.getSheets()[0]);
  SpreadsheetApp.flush();
  const url = 'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx';
  const blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } })
    .getBlob().setName('Title Brew LPO ' + lpoNo + '.xlsx');
  DriveApp.getFileById(tmp.getId()).setTrashed(true);

  const subject = 'Order. Title Brew for ' + Utilities.formatDate(delivery, TZ, 'd MMMM');
  const body = 'Hello\nPFA order for ' + (friday ? '10am' : '7.30am') + ' delivery\nThank you';
  GmailApp.createDraft(to, subject, body, { attachments: [blob] });
  ss.toast('Draft ready in Gmail with LPO ' + lpoNo + ' attached. Open Gmail, check it and press Send.', 'Title Brew', 10);
  return lpoNo;
}

// Writes today's clearances from the Kitchen tab into the Clearance Log tab (created automatically).
// Running it again on the same day replaces that day's rows, so nothing is doubled.
function logClearance(date) {
  const ss = SpreadsheetApp.getActive();
  let log = ss.getSheetByName('Clearance Log');
  if (!log) {
    log = ss.insertSheet('Clearance Log');
    log.getRange(1, 1, 1, 5).setValues([['Date', 'Item', 'Quantity', 'Reason', 'Note']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 110); log.setColumnWidth(2, 200); log.setColumnWidth(5, 220);
  }
  const key = Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
  const last = log.getLastRow();
  if (last >= 2) {
    const dates = log.getRange(2, 1, last - 1, 1).getValues();
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i][0] instanceof Date && Utilities.formatDate(dates[i][0], TZ, 'yyyy-MM-dd') === key) log.deleteRow(i + 2);
    }
  }
  const kit = ss.getSheetByName('Kitchen');
  const L = LAYOUT.Kitchen;
  const vals = kit.getRange(FIRST_ROW, 1, kit.getLastRow() - FIRST_ROW + 1, 10).getValues();
  const rows = [];
  vals.forEach(function (r) {
    if (!isItemRow(r)) return;
    const reason = String(r[L.rsn - 1]);
    const note = String(r[L.note - 1] || '');
    if (REASONS.indexOf(reason) >= 0) rows.push([date, String(r[1]), Number(r[L.s2a - 1]) || 0, reason, note]);
    else if (note) rows.push([date, String(r[1]), '', '', note]);
  });
  if (rows.length) {
    log.getRange(log.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    log.getRange(2, 1, log.getLastRow() - 1, 1).setNumberFormat('ddd d mmm yyyy');
  }
}

function logClearanceNow() {
  logClearance(SpreadsheetApp.getActive().getSheetByName('Bar').getRange('C2').getValue());
}

// Adds up what was thrown away (from the Cleared column in History) and writes it on Kitchen Review
function updateWaste() {
  const ss = SpreadsheetApp.getActive();
  const h = ss.getSheetByName(HIST_SHEET);
  const kr = ss.getSheetByName('Kitchen Review');
  const lastCol = h.getLastColumn(), lastRow = h.getLastRow();
  if (lastCol < 3 || lastRow < 3) return;
  const dates = h.getRange(1, 1, 1, lastCol).getValues()[0];
  const labels = h.getRange(2, 1, 1, lastCol).getValues()[0];
  const body = h.getRange(3, 1, lastRow - 2, lastCol).getValues();
  const today = ss.getSheetByName('Bar').getRange('C2').getValue();
  const day = 86400000;
  const totals = {};
  body.forEach(function (r) {
    const item = String(r[1]);
    if (!item) return;
    const t = { Expired: 0, Damaged: 0, 'Not sold': 0, all30: 0 };
    for (let c = 2; c < lastCol; c++) {
      if (labels[c] !== 'Cleared' || !(dates[c] instanceof Date) || !r[c]) continue;
      const age = Math.round((today - dates[c]) / day);
      if (age < 0 || age > 29) continue;
      String(r[c]).split(';').forEach(function (part) {
        const m = part.trim().match(/^([\d.]+)\s+(expired|damaged|not sold)/i);
        if (!m) return;
        const n = Number(m[1]);
        const key = REASONS.filter(function (x) { return x.toLowerCase() === m[2].toLowerCase(); })[0];
        t.all30 += n;
        if (age <= 6) t[key] += n;
      });
    }
    totals[item] = t;
  });
  const n = kr.getLastRow() - 6;
  if (n < 1) return;
  const names = kr.getRange(7, 1, n, 1).getValues();
  names.forEach(function (r, i) {
    const t = totals[String(r[0])];
    if (!t) return;
    kr.getRange(7 + i, 7, 1, 4).setValues([[t.Expired, t.Damaged, t['Not sold'], t.all30]]);
  });
}

/* ---------------- Usage learning ---------------- */

const ORDERS_SHEET = "Today's Orders";
const LOG_SHEET = 'Usage Log';
const RULES_SHEET = 'Rules';
const H_WD = 'Learned use per day, weekdays';
const H_WE = 'Learned use per day, weekends';
const H_N = 'Days of data';
const H_TR = 'Trend';

function dayKey(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }

// Saves today's stock and final orders for smart (TARGET) items
function logUsage(date) {
  const ss = SpreadsheetApp.getActive();
  const to = ss.getSheetByName(ORDERS_SHEET);
  const log = ss.getSheetByName(LOG_SHEET);
  const key = dayKey(date);
  const last = log.getLastRow();
  if (last >= 2) {
    const dates = log.getRange(2, 1, last - 1, 1).getValues();
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i][0] instanceof Date && dayKey(dates[i][0]) === key) log.deleteRow(i + 2);
    }
  }
  const vals = to.getRange(1, 1, to.getLastRow(), 22).getValues();
  const rows = [];
  vals.forEach(function (r) {
    // A item, B stock good for tomorrow, F final order, Q rule, R total stock, S count units per order unit
    if (r[16] !== 'TARGET' || !r[0]) return;
    if (r[1] === '' || r[17] === '') return;
    const pack = Number(r[18]) || 1;
    rows.push([date, String(r[0]), Number(r[1]), Number(r[17]), (Number(r[5]) || 0) * pack]);
  });
  if (rows.length) {
    log.getRange(log.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    log.getRange(2, 1, log.getLastRow() - 1, 1).setNumberFormat('ddd d mmm yyyy');
  }
}

// Pure calculation, kept separate so it is easy to check
// records: [{key:'yyyy-mm-dd', item, valid, total, ordered}]
function computeLearning(records, todayKey) {
  function toUTC(k) { const p = k.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function prevKey(k) { const d = new Date(toUTC(k) - 86400000); return d.toISOString().slice(0, 10); }
  const today = toUTC(todayKey);
  const byItem = {};
  records.forEach(function (r) {
    if (!byItem[r.item]) byItem[r.item] = {};
    byItem[r.item][r.key] = r;
  });
  const result = {};
  Object.keys(byItem).forEach(function (item) {
    const days = byItem[item];
    const samples = [];
    Object.keys(days).forEach(function (k) {
      const p = days[prevKey(k)];
      if (!p) return;
      const used = p.valid + p.ordered - days[k].total;
      if (!(used >= 0)) return;
      const t = toUTC(k);
      const dow = new Date(t).getUTCDay(); // 0 Sun, 6 Sat
      samples.push({ t: t, used: used, weekend: dow === 0 || dow === 6 });
    });
    samples.sort(function (a, b) { return b.t - a.t; });
    const wd = samples.filter(function (x) { return !x.weekend && today - x.t <= 28 * 86400000; }).slice(0, 7);
    const we = samples.filter(function (x) { return x.weekend && today - x.t <= 42 * 86400000; }).slice(0, 4);
    let wdAvg = null, weAvg = null, trend = '';
    if (wd.length) {
      let sw = 0, sv = 0;
      wd.forEach(function (x, i) { const w = wd.length - i; sw += w; sv += w * x.used; });
      wdAvg = Math.round(sv / sw * 10) / 10;
    }
    if (we.length >= 2) {
      weAvg = Math.round(we.reduce(function (a, x) { return a + x.used; }, 0) / we.length * 10) / 10;
    }
    if (wd.length >= 6) {
      const recent = (wd[0].used + wd[1].used + wd[2].used) / 3;
      const older = wd.slice(3).reduce(function (a, x) { return a + x.used; }, 0) / (wd.length - 3);
      if (older > 0 && recent < older * 0.8) trend = 'slowing';
      else if (recent > older * 1.2) trend = 'picking up';
      else trend = 'steady';
    }
    result[item] = { wd: wdAvg, we: weAvg, n: wd.length + we.length, trend: trend };
  });
  return result;
}

// Reads the Usage Log and writes learned use into the green Rules columns
function learnUsage() {
  const ss = SpreadsheetApp.getActive();
  const log = ss.getSheetByName(LOG_SHEET);
  const rules = ss.getSheetByName(RULES_SHEET);
  const last = log.getLastRow();
  if (last < 2) return;
  const records = log.getRange(2, 1, last - 1, 5).getValues()
    .filter(function (r) { return r[0] instanceof Date && r[1]; })
    .map(function (r) {
      return { key: dayKey(r[0]), item: String(r[1]), valid: Number(r[2]), total: Number(r[3]), ordered: Number(r[4]) };
    });
  const learned = computeLearning(records, dayKey(new Date()));

  const header = rules.getRange(4, 1, 1, rules.getLastColumn()).getValues()[0];
  const cWd = header.indexOf(H_WD) + 1, cWe = header.indexOf(H_WE) + 1, cN = header.indexOf(H_N) + 1, cTr = header.indexOf(H_TR) + 1;
  if (!cWd || !cWe || !cN || !cTr) return;
  const n = rules.getLastRow() - 4;
  const items = rules.getRange(5, 2, n, 1).getValues();
  const out = items.map(function (r) {
    const L = learned[String(r[0])];
    return L ? [L.wd === null ? '' : L.wd, L.we === null ? '' : L.we, L.n, L.trend] : ['', '', '', ''];
  });
  rules.getRange(5, cWd, n, 4).setValues(out);
}
