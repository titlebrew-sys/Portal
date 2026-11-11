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
 *
 * Speed (11 Nov 2026): the Orders screen used to look up the sheet cell by cell for every supplier, and to
 * read the Deliveries tab again for every supplier. Now orContext_ reads Today's Orders and the still coming
 * list ONCE per load and every supplier is built from that copy. Nothing is written differently.
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

// Staff tab column C: "Y" means manager (only managers get the Gmail draft in the Title Brew account)
function orIsManager_(name) {
  var st = SpreadsheetApp.getActive().getSheetByName('Staff');
  if (!st || st.getLastRow() < 2) return false;
  var rows = st.getRange(2, 1, st.getLastRow() - 1, 3).getDisplayValues();
  return rows.some(function (r) { return String(r[0]).trim() === name && /^y(es)?$/i.test(String(r[2]).trim()); });
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

/**
 * One copy of everything the supplier cards need, read once per load:
 *   disp / raw: columns A to H of Today's Orders (shown text, and real values), all rows
 *   coming: delayed items still coming (from the Deliveries tab)
 *   delivery: delivery date text, e.g. "12 November"
 */
function orContext_(sh) {
  sh = sh || SpreadsheetApp.getActive().getSheetByName(OR_SHEET);
  var last = sh.getLastRow();
  var rng = sh.getRange(1, 1, last, 8);
  return {
    sh: sh,
    disp: rng.getDisplayValues(),
    raw: rng.getValues(),
    coming: typeof dvStillComing_ === 'function' ? dvStillComing_() : {},
    delivery: orDeliveryText_()
  };
}

// Shown text of one cell from the copy (row and column start at 1)
function orCell_(ctx, row, col) {
  var r = ctx.disp[row - 1];
  return r && r[col - 1] !== undefined && r[col - 1] !== null ? String(r[col - 1]) : '';
}

function orBlockData_(sh, b, sups, done, ctx) {
  ctx = ctx || orContext_(sh);
  var coming = ctx.coming;
  var rows = b.items.map(function (row) {
    var r = ctx.disp[row - 1], w = ctx.raw[row - 1];
    return {
      row: row, item: r[0], count: r[1], unit: r[2], suggested: r[3],
      change: w[4] === '' || w[4] === null ? '' : String(w[4]),      // column E your change
      final: Number(w[5]) || 0, finalText: r[5], orderUnit: r[6], notes: r[7],   // column F final
      coming: coming[r[0]] || 0
    };
  });
  var s = sups[b.name] || { how: '', to: '' };
  var kind = orKind_(b.name, s.how, s.to);
  return {
    name: b.name,
    status: orCell_(ctx, b.head, 3),
    kind: kind, how: s.how, url: kind === 'website' ? s.to : '',
    emailTo: kind === 'bakery' || kind === 'email' ? s.to : '',
    subject: 'Order. Title Brew for ' + ctx.delivery,
    rows: rows,
    toOrder: rows.some(function (x) { return x.final > 0; }),
    message: b.msg ? orCell_(ctx, b.msg, 2) : '',
    check: b.check ? orCell_(ctx, b.check, 2) : '',
    lpo: b.lpo ? orCell_(ctx, b.lpo, 2) : '',
    lastLpo: kind === 'bakery' ? orLastLpo_(sh, b, ctx) : null,
    done: done[b.name] || ''
  };
}

// Delivery date as the Bakery email writes it, e.g. "10 November"
function orDeliveryText_() {
  var count = SpreadsheetApp.getActive().getSheetByName('Bar').getRange('C2').getValue();
  if (Object.prototype.toString.call(count) !== '[object Date]') return '';
  return Utilities.formatDate(new Date(count.getTime() + 86400000), TZ, 'd MMMM');
}

/* ---------------- LPO number (The Bakery) ---------------- */

/**
 * The last LPO number used and when. The "LPO Number" row is found by its label (it moves when
 * items change): column B holds the number, column C the note "LPO N last used on <date>".
 * A copy is kept in Script Properties in case the row is rebuilt.
 * ctx is optional: with it the sheet copy is used, without it the cells are read live.
 */
function orLastLpo_(sh, b, ctx) {
  // today: true when that number was used today, so it may be issued again if the file never reached the phone
  var todayText = Utilities.formatDate(new Date(), TZ, 'EEE d MMM');
  var note = b.lpo ? (ctx ? orCell_(ctx, b.lpo, 3) : String(sh.getRange(b.lpo, 3).getDisplayValue())) : '';
  var m = note.match(/LPO\s+(\d+)\s+last used on\s+([^.]+)/i);
  if (m) return { no: Number(m[1]), on: m[2].trim(), today: m[2].trim() === todayText };
  var saved = PropertiesService.getScriptProperties().getProperty('tb_last_lpo');
  if (saved) {
    try { var p = JSON.parse(saved); p.today = String(p.on) === todayText; return p; } catch (e) { /* ignore */ }
  }
  var n = b.lpo ? Number(ctx ? ctx.raw[b.lpo - 1][1] : sh.getRange(b.lpo, 2).getValue()) : 0;
  return n > 0 ? { no: n, on: '', today: false } : null;
}

/**
 * Checks the typed LPO number and writes it to the LPO Number row (Rules C2 reads it).
 * Returns { ok, no } or { ok: false, msg }.
 */
function orSetLpo_(sh, b, newLpo) {
  var typed = Number(String(newLpo === undefined || newLpo === null ? '' : newLpo).trim());
  var last = orLastLpo_(sh, b);
  if (!(typed > 0) || Math.round(typed) !== typed) return { ok: false, msg: 'Type the new LPO number.' };
  // Higher than the last number, or the same number again if it was used today (the file may never have reached the phone)
  if (last && (typed < last.no || (typed === last.no && !last.today))) return { ok: false, msg: 'The new LPO number must be higher than ' + last.no + '.' };
  if (!b.lpo) return { ok: false, msg: 'The LPO Number row is missing on Today\'s Orders.' };
  sh.getRange(b.lpo, 2).setValue(typed);
  SpreadsheetApp.flush();
  return { ok: true, no: typed };
}

/** Remembers that this LPO number was used today (note on Today's Orders and Script Properties). */
function orLpoUsed_(sh, b, no) {
  var on = Utilities.formatDate(new Date(), TZ, 'EEE d MMM');
  PropertiesService.getScriptProperties().setProperty('tb_last_lpo', JSON.stringify({ no: no, on: on }));
  if (b.lpo) sh.getRange(b.lpo, 3).setValue('LPO ' + no + ' last used on ' + on + '. Change the number after this order is sent.').setFontColor('#666666');
}

/* ---------------- Called by the app ---------------- */

function spOrders(token) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanOrder(name)) return { ok: false, msg: 'Only people allowed to order can open this screen.' };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OR_SHEET);
  var sups = orSuppliers_(), done = orDoneToday_();
  var ctx = orContext_(sh);   // one read for all suppliers
  var list = orBlocks_().map(function (b) { return orBlockData_(sh, b, sups, done, ctx); });
  return {
    ok: true,
    open: orOpen_(name),
    manager: orIsManager_(name),
    countDate: orCell_(ctx, 2, 2),
    delivery: orCell_(ctx, 3, 2),
    note: orCell_(ctx, 2, 4),
    notCounted: orCell_(ctx, 4, 2),
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
  // The copy of the sheet is made after the change is written, so the answer shows the new numbers
  return { ok: true, supplier: orBlockData_(sh, b, orSuppliers_(), orDoneToday_()) };
}

/** Gmail draft for an email supplier (The Bakery with the LPO attached, using the number typed in the app). */
function spOrderDraft(token, supplier, newLpo) {
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
      // Rules C2 reads the LPO Number row, and draftBakeryEmail uses Rules C2 for the LPO and the file name
      var set = orSetLpo_(sh, b, newLpo);
      if (!set.ok) return set;
      var typed = set.no;
      var lpoNo = draftBakeryEmail();
      if (Number(lpoNo) !== typed) return { ok: false, msg: 'The LPO came out as ' + lpoNo + ', not ' + typed + '. Check that Rules C2 reads the LPO Number row. The draft was made, delete it in Gmail.' };
      orLpoUsed_(sh, b, typed);
      extra = ' with LPO ' + lpoNo;
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

/**
 * The Bakery LPO as an Excel file the phone can download (for staff who send from their own email).
 * Same file as the Gmail draft attachment. Saved in the Drive folder "Title Brew LPO files", readable
 * by anyone with the link, and removed after 7 days.
 */
function spLpoFile(token, newLpo) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanOrder(name)) return { ok: false, msg: 'Not allowed.' };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OR_SHEET);
  var b = orBlocks_().filter(function (x) { return x.name === 'The Bakery'; })[0];
  if (!b) return { ok: false, msg: 'The Bakery is not on Today\'s Orders.' };
  var data = orBlockData_(sh, b, orSuppliers_(), {});
  if (!data.toOrder) return { ok: false, msg: 'Nothing to order from The Bakery today.' };
  var set = orSetLpo_(sh, b, newLpo);
  if (!set.ok) return set;
  var no = Number(ss.getSheetByName('Rules').getRange('C2').getValue());
  if (no !== set.no) return { ok: false, msg: 'Rules C2 shows ' + no + ', not ' + set.no + '. Check that Rules C2 reads the LPO Number row.' };
  try {
    var lpo = ss.getSheetByName('LPO');
    var tmp = SpreadsheetApp.create('Title Brew LPO temp');
    var copy = lpo.copyTo(tmp).setName('LPO');
    var range = lpo.getDataRange();
    copy.getRange(1, 1, range.getNumRows(), range.getNumColumns()).setValues(range.getValues());
    tmp.deleteSheet(tmp.getSheets()[0]);
    SpreadsheetApp.flush();
    var blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob().setName('Title Brew LPO ' + no + '.xlsx');
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
    var folders = DriveApp.getFoldersByName('Title Brew LPO files');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Title Brew LPO files');
    var old = folder.getFiles(), weekAgo = Date.now() - 7 * 864e5;
    // Files older than 7 days go, and so does an earlier file with this same name (same number issued again)
    while (old.hasNext()) { var f = old.next(); if (f.getDateCreated().getTime() < weekAgo || f.getName() === blob.getName()) f.setTrashed(true); }
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    orLpoUsed_(sh, b, no);
    orLog_(name, 'The Bakery', 'LPO ' + no + ' downloaded', data.message);
    return { ok: true, no: no, name: file.getName(), url: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
  } catch (e) {
    return { ok: false, msg: 'No LPO file: ' + (e && e.message ? e.message : e) };
  }
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
  orLog_(name, supplier, how === 'website' ? 'Website opened' : how === 'email' ? 'Email opened' : 'WhatsApp opened', data.message);
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
