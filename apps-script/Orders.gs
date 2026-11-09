/**
 * Title Brew staff app: Orders screen (server side).
 * Add this as a NEW script file called "Orders", next to Code, StaffPage, Page, PortalBridge and Deliveries.
 *
 * Only people with "Y" in the Staff tab column D ("Can send orders") see it. This is separate from
 * the Manager column C: being able to order gives no right to edit counts after the locks.
 *
 * Everything comes from the Today's Orders tab, so the app always shows the same as the sheet:
 *   Count, Suggested, Your change (editable, written to the same cell), Final order, the Message.
 * Email suppliers (Almarai, The Bakery): "Save as draft" makes a Gmail draft, using the same
 *   functions as the tick boxes. The Bakery draft has the LPO attached.
 * WhatsApp suppliers: the app opens WhatsApp with the message written; the person picks the group.
 * Every draft and WhatsApp order is written to the "Orders Log" tab.
 * It reuses TZ (Code), spWho, spLocksFor, spTodayKey (StaffPage) and draftBakeryEmail, draftSupplierEmail (Code).
 */

var OR_SHEET = "Today's Orders";
var OR_LOG = 'Orders Log';

/* ---------------- Who can order ---------------- */

// Staff tab column D: "Y" means this person can place orders
function orCanOrder(name) {
  var st = SpreadsheetApp.getActive().getSheetByName('Staff');
  if (!st || st.getLastRow() < 2 || st.getMaxColumns() < 4) return false;
  var rows = st.getRange(2, 1, st.getLastRow() - 1, 4).getDisplayValues();
  return rows.some(function (r) { return String(r[0]).trim() === name && /^y(es)?$/i.test(String(r[3]).trim()); });
}

function spOrderAccess(token) {
  var name = spWho(token);
  if (!name) return { expired: true };
  return { ok: true, canOrder: orCanOrder(name) };
}

// Your change can be edited from 4am to 11pm (managers at any time), like the counts
function orOpen_(name) {
  var locks = spLocksFor(name);
  return !locks.night;
}

/* ---------------- Reading Today's Orders ---------------- */

// Supplier blocks: name row, "Item" row, item rows (column Q holds the rule), then Message, Check, Email
function orBlocks_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(OR_SHEET);
  var last = sh.getLastRow();
  var a = sh.getRange(1, 1, last, 1).getValues().map(function (r) { return String(r[0]); });
  var q = sh.getRange(1, 17, last, 1).getValues().map(function (r) { return String(r[0]); });
  var out = [];
  for (var i = 0; i < last - 1; i++) {
    if (!a[i] || a[i + 1] !== 'Item') continue;
    var b = { name: a[i], head: i + 1, items: [], msg: 0, check: 0, email: 0, lpo: 0 };
    for (var j = i + 2; j < last; j++) {
      if (a[j + 1] === 'Item') break;
      if (a[j] === 'Message') b.msg = j + 1;
      else if (a[j] === 'Check') b.check = j + 1;
      else if (a[j] === 'Email') b.email = j + 1;
      else if (/^lpo/i.test(a[j].trim())) b.lpo = j + 1;
      else if (q[j] && !b.msg) b.items.push(j + 1);
    }
    if (b.items.length) out.push(b);
  }
  return out;
}

function orSuppliers_() {
  var sup = SpreadsheetApp.getActive().getSheetByName('Suppliers');
  var out = {};
  sup.getRange(5, 1, Math.max(sup.getLastRow() - 4, 1), 3).getDisplayValues().forEach(function (r) {
    if (r[0]) out[String(r[0])] = { how: String(r[1]), to: String(r[2]) };
  });
  return out;
}

function orKind_(name, how, to) {
  var h = String(how).toLowerCase();
  if (name === 'The Bakery') return 'bakery';
  if (h.indexOf('email') >= 0 && to.indexOf('@') > 0) return 'email';
  if (h.indexOf('whatsapp') >= 0) return 'whatsapp';
  if (/^https?:\/\//i.test(to)) return 'website';
  return 'other';
}

// What was done today per supplier, from the Orders Log
function orDoneToday_() {
  var log = SpreadsheetApp.getActive().getSheetByName(OR_LOG);
  var out = {};
  if (!log || log.getLastRow() < 2) return out;
  var today = spTodayKey();
  log.getRange(2, 1, log.getLastRow() - 1, 4).getValues().forEach(function (r) {
    if (!(r[0] instanceof Date) || Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd') !== today) return;
    out[String(r[2])] = String(r[3]) + ' by ' + String(r[1]) + ' at ' + Utilities.formatDate(r[0], TZ, 'h:mma').toLowerCase();
  });
  return out;
}

function orBlockData_(sh, b, sups, done) {
  var first = b.items[0], lastRow = b.items[b.items.length - 1];
  var v = sh.getRange(first, 1, lastRow - first + 1, 8).getDisplayValues();
  var raw = sh.getRange(first, 5, lastRow - first + 1, 2).getValues();   // E your change, F final
  var rows = b.items.map(function (row) {
    var i = row - first, r = v[i];
    return {
      row: row, item: r[0], count: r[1], unit: r[2], suggested: r[3],
      change: raw[i][0] === '' || raw[i][0] === null ? '' : String(raw[i][0]),
      final: Number(raw[i][1]) || 0, finalText: r[5], orderUnit: r[6], notes: r[7]
    };
  });
  var s = sups[b.name] || { how: '', to: '' };
  var kind = orKind_(b.name, s.how, s.to);
  return {
    name: b.name,
    status: String(sh.getRange(b.head, 3).getDisplayValue()),
    kind: kind, how: s.how, url: kind === 'website' ? s.to : '',
    rows: rows,
    toOrder: rows.some(function (x) { return x.final > 0; }),
    message: b.msg ? String(sh.getRange(b.msg, 2).getDisplayValue()) : '',
    check: b.check ? String(sh.getRange(b.check, 2).getDisplayValue()) : '',
    lpo: b.lpo ? String(sh.getRange(b.lpo, 2).getDisplayValue()) : '',
    done: done[b.name] || ''
  };
}

/* ---------------- Called by the app ---------------- */

function spOrders(token) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanOrder(name)) return { ok: false, msg: 'Only people allowed to order can open this screen.' };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OR_SHEET);
  var sups = orSuppliers_(), done = orDoneToday_();
  var list = orBlocks_().map(function (b) { return orBlockData_(sh, b, sups, done); });
  return {
    ok: true,
    open: orOpen_(name),
    countDate: String(sh.getRange('B2').getDisplayValue()),
    delivery: String(sh.getRange('B3').getDisplayValue()),
    note: String(sh.getRange('D2').getDisplayValue()),
    notCounted: String(sh.getRange('B4').getDisplayValue()),
    saturday: Utilities.formatDate(new Date(), TZ, 'u') === '6',
    suppliers: list
  };
}

/** Writes Your change for one item row ('' = accept the suggestion) and returns that supplier again. */
function spSetChange(token, row, value) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanOrder(name)) return { ok: false, msg: 'Not allowed.' };
  if (!orOpen_(name)) return { ok: false, msg: 'Orders are closed from 11pm until 4am.' };
  var b = orBlocks_().filter(function (x) { return x.items.indexOf(Number(row)) >= 0; })[0];
  if (!b) return { ok: false, msg: 'This item is no longer on Today\'s Orders. Reload the screen.' };
  var v = String(value === null || value === undefined ? '' : value).trim().replace(',', '.');
  if (v !== '' && (!isFinite(Number(v)) || Number(v) < 0)) return { ok: false, msg: 'Type a number, 0 to skip, or leave it empty to accept the suggestion.' };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OR_SHEET);
  var cell = sh.getRange(Number(row), 5);
  if (v === '') cell.clearContent(); else cell.setValue(Number(v));
  SpreadsheetApp.flush();
  return { ok: true, supplier: orBlockData_(sh, b, orSuppliers_(), orDoneToday_()) };
}

/** Gmail draft for an email supplier (The Bakery with the LPO attached). */
function spOrderDraft(token, supplier) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanOrder(name)) return { ok: false, msg: 'Not allowed.' };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OR_SHEET);
  var b = orBlocks_().filter(function (x) { return x.name === supplier; })[0];
  if (!b) return { ok: false, msg: supplier + ' is not on Today\'s Orders.' };
  var data = orBlockData_(sh, b, orSuppliers_(), {});
  if (!data.toOrder) return { ok: false, msg: 'Nothing to order from ' + supplier + ' today.' };
  var extra = '';
  try {
    if (data.kind === 'bakery') {
      var lpoNo = draftBakeryEmail();
      extra = ' with LPO ' + lpoNo;
      if (b.lpo) {
        sh.getRange(b.lpo, 3).setValue('LPO ' + lpoNo + ' last used on ' +
          Utilities.formatDate(new Date(), TZ, 'EEE d MMM') + '. Change the number after this order is sent.').setFontColor('#666666');
      }
    } else if (data.kind === 'email') {
      draftSupplierEmail(supplier, data.message);
    } else {
      return { ok: false, msg: supplier + ' is not ordered by email.' };
    }
  } catch (e) {
    return { ok: false, msg: 'No draft: ' + (e && e.message ? e.message : e) };
  }
  orLog_(name, supplier, 'Gmail draft' + extra, data.message);
  // Same note as the tick box in the sheet, so both show what happened
  if (b.email) sh.getRange(b.email, 4).setValue('Draft ready in Gmail at ' + Utilities.formatDate(new Date(), TZ, 'h:mma').toLowerCase() +
    extra + ' (from the app, ' + name + '). Open Gmail, check it and press Send.').setFontColor('#2D6A4F');
  return { ok: true, msg: 'Draft ready in Gmail' + extra + '.' };
}

/** Records that the WhatsApp (or website) order was opened. The app opens WhatsApp itself. */
function spOrderSent(token, supplier, how) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanOrder(name)) return { ok: false, msg: 'Not allowed.' };
  var sh = SpreadsheetApp.getActive().getSheetByName(OR_SHEET);
  var b = orBlocks_().filter(function (x) { return x.name === supplier; })[0];
  if (!b) return { ok: false, msg: supplier + ' is not on Today\'s Orders.' };
  var data = orBlockData_(sh, b, orSuppliers_(), {});
  orLog_(name, supplier, how === 'website' ? 'Website opened' : 'WhatsApp opened', data.message);
  return { ok: true };
}

function orLog_(name, supplier, action, message) {
  var ss = SpreadsheetApp.getActive();
  var log = ss.getSheetByName(OR_LOG);
  if (!log) {
    log = ss.insertSheet(OR_LOG);
    log.getRange(1, 1, 1, 5).setValues([['When', 'Staff', 'Supplier', 'Action', 'Order']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 150); log.setColumnWidth(3, 170); log.setColumnWidth(4, 200); log.setColumnWidth(5, 380);
  }
  var msg = String(message || '').slice(0, 2000);
  if (/^[=+\-@]/.test(msg)) msg = "'" + msg;
  log.appendRow([new Date(), name, supplier, action, msg]);
  log.getRange(log.getLastRow(), 1).setNumberFormat('ddd d mmm, h:mm am/pm');
}
