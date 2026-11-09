/**
 * Title Brew staff app: Deliveries screen (server side).
 * Add this as a NEW script file called "Deliveries", next to Code, StaffPage, Page and PortalBridge.
 * It reuses TZ, FIRST_ROW, isItemRow (Code) and spWho, spTodayKey (StaffPage).
 *
 * - Expected today: what was ordered yesterday (saved from Today's Orders at 5pm and 11pm).
 * - Staff confirm each supplier, or change a number when something is short or extra.
 * - Staff add anything that arrived without an order: bought from a shop, or extra from a supplier.
 * Everything is written to the "Deliveries" tab and sent to the portal with the counts.
 * After each confirmation or arrival, Kitchen expiry dates follow what actually arrived.
 */

var DV_SHEET = 'Deliveries';
var DV_HEAD = ['Date', 'When', 'Staff', 'Type', 'Supplier', 'Item', 'Count item', 'Ordered', 'Arrived', 'Arrived (count units)', 'Unit', 'Paid (AED)', 'Why', 'Note', 'Entry'];
var DV_TYPES = { order: 'Order', supplier: 'Extra from a supplier', shop: 'Bought from a shop' };
var DV_WHY = ['Ran out', 'Supplier sent extra', 'Other'];

function dvSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(DV_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DV_SHEET);
    sh.getRange(1, 1, 1, DV_HEAD.length).setValues([DV_HEAD]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 150); sh.setColumnWidth(6, 200); sh.setColumnWidth(7, 160); sh.setColumnWidth(14, 200);
  }
  return sh;
}

function dvIsDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function dvKey_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function dvAddDays_(key, n) { return new Date(Date.parse(key + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

/**
 * Remembers today's final orders with quantities, per supplier, so tomorrow staff can confirm them.
 * Called at the 5pm and 11pm saves. Nothing is ordered on Saturday.
 */
function deliveriesSnapshotOrders_() {
  var ss = SpreadsheetApp.getActive();
  var date = ss.getSheetByName('Bar').getRange('C2').getValue();
  if (!dvIsDate_(date)) return;
  var key = dvKey_(date);
  if (new Date(key + 'T12:00:00Z').getUTCDay() === 6) return;
  var to = ss.getSheetByName("Today's Orders");
  if (!to || to.getLastRow() < 2) return;
  // Order item -> counted item, from the Rules tab (column B order item, column C counted item)
  var countName = {};
  var rules = ss.getSheetByName('Rules');
  rules.getRange(5, 1, rules.getLastRow() - 4, 3).getValues().forEach(function (r) { if (r[1]) countName[String(r[1])] = String(r[2]); });
  var a = to.getRange(1, 1, to.getLastRow(), 19).getValues();
  var lines = [], supplier = '';
  for (var i = 0; i < a.length; i++) {
    var first = String(a[i][0]);
    // A supplier block starts with its name, then a row with "Item"
    if (first && i + 1 < a.length && String(a[i + 1][0]) === 'Item') { supplier = first; continue; }
    if (!a[i][16] || !first || !supplier) continue;   // column Q holds the rule on item rows only
    var qty = Number(a[i][5]) || 0;                   // column F final order
    if (qty <= 0) continue;
    lines.push({ supplier: supplier, item: first, qty: qty, pack: Number(a[i][18]) || 1, countItem: countName[first] || '' });
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('dvorders_' + key, JSON.stringify(lines));
  var limit = dvAddDays_(key, -14);
  props.getKeys().forEach(function (k) { if (k.indexOf('dvorders_') === 0 && k.slice(9) < limit) props.deleteProperty(k); });
}

/** Yesterday's orders, grouped by supplier. */
function dvExpected_(todayKey) {
  var raw = PropertiesService.getScriptProperties().getProperty('dvorders_' + dvAddDays_(todayKey, -1));
  var lines = [];
  try { lines = raw ? JSON.parse(raw) : []; } catch (e) { lines = []; }
  var by = {};
  lines.forEach(function (l) { (by[l.supplier] = by[l.supplier] || []).push(l); });
  return by;
}

/** Rows of the Deliveries tab for one day. */
function dvRows_(dayKey) {
  var sh = dvSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, DV_HEAD.length).getValues()
    .map(function (r, i) { return { row: i + 2, r: r }; })
    .filter(function (x) { return dvIsDate_(x.r[0]) ? dvKey_(x.r[0]) === dayKey : String(x.r[0]) === dayKey; });
}

/** Counted items for the "What came?" list, with their unit, and each supplier's items. */
function dvItems_() {
  var ss = SpreadsheetApp.getActive();
  var items = [];
  ['Bar', 'Kitchen', 'Weekly'].forEach(function (area) {
    var sh = ss.getSheetByName(area);
    if (!sh || sh.getLastRow() < FIRST_ROW) return;
    sh.getRange(FIRST_ROW, 1, sh.getLastRow() - FIRST_ROW + 1, 3).getValues().forEach(function (r) {
      if (!isItemRow(r)) return;
      items.push({ name: String(r[1]), unit: area === 'Kitchen' ? 'pcs' : String(r[2] || ''), area: area });
    });
  });
  var bySupplier = {};
  var rules = ss.getSheetByName('Rules');
  rules.getRange(5, 1, rules.getLastRow() - 4, 3).getValues().forEach(function (r) {
    if (r[0] && r[2]) (bySupplier[String(r[0])] = bySupplier[String(r[0])] || []).push(String(r[2]));
  });
  return { items: items, bySupplier: bySupplier };
}

/**
 * What actually arrived today, per counted item, from the Deliveries tab:
 * { item: qty in count units }. Items confirmed as not delivered are there with 0.
 */
function dvArrivedToday_(dayKey) {
  var out = {};
  dvRows_(dayKey || spTodayKey()).forEach(function (x) {
    var item = String(x.r[6] || x.r[5]);
    if (!item) return;
    out[item] = (out[item] || 0) + (Number(x.r[9]) || 0);
  });
  return out;
}

/**
 * Kitchen expiry dates follow what arrived today:
 *   something arrived and New expiry is empty: New expiry = today + shelf life - 1
 *   confirmed as not delivered and New expiry is the date the 4am reset expected: New expiry cleared
 * Dates typed by staff are left alone.
 */
function dvApplyExpiry_(dayKey) {
  var ss = SpreadsheetApp.getActive();
  var arrived = dvArrivedToday_(dayKey);
  if (!Object.keys(arrived).length) return;
  var shelf = {};
  var rules = ss.getSheetByName('Rules');
  rules.getRange(5, 1, rules.getLastRow() - 4, 26).getValues().forEach(function (r) { if (Number(r[25]) > 0) shelf[String(r[2])] = Number(r[25]); });
  var today = Utilities.parseDate(dayKey, TZ, 'yyyy-MM-dd');
  var kit = ss.getSheetByName('Kitchen');
  var vals = kit.getRange(FIRST_ROW, 1, kit.getLastRow() - FIRST_ROW + 1, 4).getValues();
  vals.forEach(function (r, i) {
    var item = String(r[1]);
    if (!isItemRow(r) || !shelf[item] || !(item in arrived)) return;
    var auto = new Date(today.getTime() + (shelf[item] - 1) * 864e5);
    var cur = r[3];
    if (arrived[item] > 0 && !dvIsDate_(cur)) {
      kit.getRange(FIRST_ROW + i, 4).setValue(auto);
    } else if (arrived[item] === 0 && dvIsDate_(cur) && dvKey_(cur) === dvKey_(auto)) {
      kit.getRange(FIRST_ROW + i, 4).clearContent();
    }
  });
}

/* ---------------- Called by the staff page ---------------- */

function spDeliveries(token) {
  var name = spWho(token);
  if (!name) return { expired: true };
  var today = spTodayKey();
  var expected = dvExpected_(today);
  var rows = dvRows_(today);
  var suppliers = Object.keys(expected).map(function (s) {
    var conf = rows.filter(function (x) { return x.r[3] === DV_TYPES.order && String(x.r[4]) === s; });
    var arrived = {};
    conf.forEach(function (x) { arrived[String(x.r[5])] = Number(x.r[8]) || 0; });
    return {
      name: s,
      confirmedAt: conf.length ? Utilities.formatDate(conf[0].r[1], TZ, 'h:mma').toLowerCase() : '',
      confirmedBy: conf.length ? String(conf[0].r[2]) : '',
      items: expected[s].map(function (l) {
        return { item: l.item, ordered: l.qty, arrived: l.item in arrived ? arrived[l.item] : null };
      }),
    };
  });
  var extras = {};
  rows.filter(function (x) { return x.r[3] !== DV_TYPES.order; }).forEach(function (x) {
    var id = String(x.r[14]);
    if (!extras[id]) extras[id] = { type: String(x.r[3]), supplier: String(x.r[4]), by: String(x.r[2]), at: Utilities.formatDate(x.r[1], TZ, 'h:mma').toLowerCase(), paid: x.r[11], why: String(x.r[12]), note: String(x.r[13]), items: [] };
    extras[id].items.push({ item: String(x.r[6]), qty: x.r[9], unit: String(x.r[10]) });
  });
  var lists = dvItems_();
  return {
    name: name, today: today, sunday: new Date(today + 'T12:00:00Z').getUTCDay() === 0,
    suppliers: suppliers, extras: Object.keys(extras).map(function (k) { return extras[k]; }),
    items: lists.items, bySupplier: lists.bySupplier, supplierNames: Object.keys(lists.bySupplier).sort(), why: DV_WHY,
  };
}

/** Confirms one supplier's delivery. items: [{item, qty}] in the units it was ordered in. */
function spConfirmDelivery(token, supplier, items) {
  var name = spWho(token);
  if (!name) return { expired: true };
  var today = spTodayKey();
  var expected = (dvExpected_(today)[supplier]) || [];
  if (!expected.length) return { ok: false, msg: supplier + ' was not ordered yesterday.' };
  var got = {};
  (Array.isArray(items) ? items : []).forEach(function (x) { if (x && x.item !== undefined) got[String(x.item)] = x.qty; });
  var out = [];
  for (var i = 0; i < expected.length; i++) {
    var l = expected[i];
    var v = l.item in got ? String(got[l.item]).trim().replace(',', '.') : String(l.qty);
    var q = Number(v);
    if (v === '' || !isFinite(q) || q < 0) return { ok: false, msg: 'Check the number for ' + l.item + '.' };
    out.push([today, new Date(), name, DV_TYPES.order, supplier, l.item, l.countItem, l.qty, q, q * (l.pack || 1), '', '', '', '', 'order|' + today + '|' + supplier]);
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dvSheet_();
    // Confirming again replaces the earlier confirmation
    dvRows_(today).filter(function (x) { return x.r[3] === DV_TYPES.order && String(x.r[4]) === supplier; })
      .reverse().forEach(function (x) { sh.deleteRow(x.row); });
    sh.getRange(sh.getLastRow() + 1, 1, out.length, DV_HEAD.length).setValues(out);
    sh.getRange(2, 2, sh.getLastRow() - 1, 1).setNumberFormat('ddd d mmm, h:mm am/pm');
    SpreadsheetApp.flush();
    try { dvApplyExpiry_(today); } catch (e) { Logger.log('Expiry from deliveries: ' + e); }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/**
 * Something arrived without an order.
 * p: {kind: 'shop' | 'supplier', supplier, items: [{item, qty}] in counting units, paid, why, note}
 */
function spAddArrival(token, p) {
  var name = spWho(token);
  if (!name) return { expired: true };
  p = p || {};
  var kind = p.kind === 'supplier' ? 'supplier' : 'shop';
  var lists = dvItems_();
  var unitOf = {};
  lists.items.forEach(function (x) { unitOf[x.name] = x.unit; });
  var lines = (Array.isArray(p.items) ? p.items : []).filter(function (x) { return x && String(x.item || '') !== ''; });
  if (!lines.length) return { ok: false, msg: 'Add at least one item.' };
  if (kind === 'supplier' && !p.supplier) return { ok: false, msg: 'Choose the supplier.' };
  var paid = String(p.paid === undefined || p.paid === null ? '' : p.paid).trim().replace(',', '.');
  if (kind === 'shop' && (paid === '' || !isFinite(Number(paid)) || Number(paid) < 0)) return { ok: false, msg: 'Type the total paid.' };
  var why = DV_WHY.indexOf(String(p.why)) >= 0 ? String(p.why) : '';
  if (!why) return { ok: false, msg: 'Choose why.' };
  var note = String(p.note || '').slice(0, 200);
  if (/^[=+\-@]/.test(note)) note = "'" + note;
  var today = spTodayKey();
  var id = 'extra|' + Utilities.getUuid();
  var rows = [];
  for (var i = 0; i < lines.length; i++) {
    var item = String(lines[i].item);
    if (!(item in unitOf)) return { ok: false, msg: item + ' is not on the count list.' };
    var q = Number(String(lines[i].qty).replace(',', '.'));
    if (!isFinite(q) || q <= 0) return { ok: false, msg: 'Check the amount for ' + item + '.' };
    rows.push([today, new Date(), name, DV_TYPES[kind], kind === 'supplier' ? String(p.supplier) : '', item, item, '', q, q, unitOf[item],
      i === 0 && kind === 'shop' ? Number(paid) : '', why, note, id]);
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dvSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, DV_HEAD.length).setValues(rows);
    sh.getRange(2, 2, sh.getLastRow() - 1, 1).setNumberFormat('ddd d mmm, h:mm am/pm');
    SpreadsheetApp.flush();
    try { dvApplyExpiry_(today); } catch (e) { Logger.log('Expiry from deliveries: ' + e); }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/* ---------------- For the portal (used by PortalBridge) ---------------- */

/** Today's and yesterday's deliveries, in the form the portal reads. */
function deliveriesForPortal_() {
  var today = dvKey_(SpreadsheetApp.getActive().getSheetByName('Bar').getRange('C2').getValue());
  var out = [];
  [today, dvAddDays_(today, -1)].forEach(function (day) {
    var groups = {};
    dvRows_(day).forEach(function (x) {
      var r = x.r, id = String(r[14]);
      if (!groups[id]) {
        groups[id] = {
          id: id, business_date: day, kind: r[3] === DV_TYPES.order ? 'order' : r[3] === DV_TYPES.shop ? 'shop' : 'supplier',
          supplier: String(r[4]), order_date: dvAddDays_(day, -1), at: dvIsDate_(r[1]) ? r[1].toISOString() : new Date().toISOString(),
          by: String(r[2]), paid: r[11] === '' ? null : Number(r[11]), why: String(r[12]), note: String(r[13]), items: [],
        };
      }
      groups[id].items.push({ order_item: String(r[5]), count_item: String(r[6]), ordered: r[7] === '' ? null : Number(r[7]), qty: Number(r[8]), count_qty: Number(r[9]) });
    });
    Object.keys(groups).forEach(function (k) { out.push(groups[k]); });
  });
  return out;
}
