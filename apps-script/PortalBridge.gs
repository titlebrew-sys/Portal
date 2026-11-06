/**
 * Title Brew portal bridge: sends today's counts from this Google Sheet to the portal.
 *
 * Add this as a NEW script file called "PortalBridge" (your other files stay as they are).
 * Settings are kept in Script Properties (Project Settings > Script Properties), never in code:
 *   PORTAL_BRIDGE_URL     https://<your project>.supabase.co/functions/v1/sheet-counts
 *   PORTAL_BRIDGE_SECRET  the same text as the Supabase secret BRIDGE_SECRET
 *
 * Then add one line at the very end of spSave, saveShift1 and saveShift2:
 *   portalBridgeSend();
 *
 * It never stops a staff save: every problem is caught and written to the "Bridge Log" tab.
 * Run portalBridgeTest() first: it writes what it reads to "Bridge Log" without sending anything.
 */

/**
 * Only needed if the automatic column finding gets a tab wrong. Use column letters, e.g.
 *   Bar:     { firstRow: 3, item: 'A', shift1: 'C', shift2: 'D' }
 *   Kitchen: { firstRow: 3, item: 'B', s1old: 'E', s1new: 'F', frozen: 'G', expOld: 'C', expNew: 'D', s2old: 'H', s2new: 'I', cleared: 'J', reason: 'K' }
 *   Weekly:  { firstRow: 3, item: 'A', qty: 'C' }
 */
var PORTAL_BRIDGE_TABS = { Bar: null, Kitchen: null, Weekly: null };

var PORTAL_BRIDGE_LOG = 'Bridge Log';

/** Sends today's Bar, Kitchen and Weekly counts. Safe to call as often as you like. */
function portalBridgeSend(savedBy) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('PORTAL_BRIDGE_URL');
    var secret = props.getProperty('PORTAL_BRIDGE_SECRET');
    if (!url || !secret) { portalBridgeLog_('Not sent', 'Add PORTAL_BRIDGE_URL and PORTAL_BRIDGE_SECRET in Script Properties.'); return; }
    var batches = portalBridgeBatches_(savedBy);
    if (!batches.length) { portalBridgeLog_('Nothing to send', 'No counts found for today.'); return; }
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-bridge-secret': secret },
      payload: JSON.stringify({ batches: batches }),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    portalBridgeLog_(code === 200 ? 'Sent' : 'Problem (' + code + ')', res.getContentText().slice(0, 900));
  } catch (e) {
    portalBridgeLog_('Error', String(e && e.message ? e.message : e));
  }
}

/** Shows what would be sent, in the Bridge Log tab. Sends nothing. */
function portalBridgeTest() {
  try {
    ['Bar', 'Kitchen', 'Weekly'].forEach(function (area) {
      var cols = portalBridgeColumns_(area);
      portalBridgeLog_('Test: ' + area + ' columns', cols ? JSON.stringify(cols) : 'Tab or columns not found');
    });
    var batches = portalBridgeBatches_('Test');
    batches.forEach(function (b) {
      portalBridgeLog_('Test: ' + b.area + ' shift ' + b.shift, b.rows.length + ' rows, first: ' + JSON.stringify(b.rows.slice(0, 3)));
    });
    if (!batches.length) portalBridgeLog_('Test', 'No counts found for today.');
  } catch (e) {
    portalBridgeLog_('Test error', String(e && e.message ? e.message : e));
  }
}

// ---------------------------------------------------------------- reading the tabs

/** Business day in Dubai: a new day starts at 4am. */
function portalBridgeToday_() {
  return Utilities.formatDate(new Date(Date.now() - 4 * 3600 * 1000), 'Asia/Dubai', 'yyyy-MM-dd');
}

function portalBridgeBatches_(savedBy) {
  var who = savedBy || 'Google Sheet';
  var date = portalBridgeToday_();
  var at = new Date().toISOString();
  var out = [];
  ['Bar', 'Kitchen', 'Weekly'].forEach(function (area) {
    var cols = portalBridgeColumns_(area);
    if (!cols) return;
    var sheet = SpreadsheetApp.getActive().getSheetByName(cols.sheet);
    var last = sheet.getLastRow();
    if (last < cols.firstRow) return;
    var width = sheet.getLastColumn();
    var values = sheet.getRange(cols.firstRow, 1, last - cols.firstRow + 1, width).getValues();
    var get = function (row, key) { return cols[key] ? row[cols[key] - 1] : null; };
    var rows1 = [], rows2 = [], rowsW = [];
    values.forEach(function (row) {
      var item = String(get(row, 'item') || '').trim();
      if (!item) return;
      if (area === 'Weekly') {
        var q = portalBridgeNum_(get(row, 'qty'));
        if (q !== null) rowsW.push({ item: item, qty: q });
        return;
      }
      if (area === 'Bar') {
        var a = portalBridgeNum_(get(row, 'shift1')), b = portalBridgeNum_(get(row, 'shift2'));
        if (a !== null) rows1.push({ item: item, qty: a });
        if (b !== null) rows2.push({ item: item, qty: b });
        return;
      }
      // Kitchen: old batch + new batch + frozen, with expiry dates; cleared items go with the closing count
      var common = { old_expiry: portalBridgeDate_(get(row, 'expOld')), new_expiry: portalBridgeDate_(get(row, 'expNew')) };
      var s1 = { item: item, old: portalBridgeNum_(get(row, 's1old')), new: portalBridgeNum_(get(row, 's1new')), frozen: portalBridgeNum_(get(row, 'frozen')), qty: portalBridgeNum_(get(row, 'shift1')) };
      var s2 = { item: item, old: portalBridgeNum_(get(row, 's2old')), new: portalBridgeNum_(get(row, 's2new')), frozen: portalBridgeNum_(get(row, 's2frozen')), qty: portalBridgeNum_(get(row, 'shift2')),
        cleared_qty: portalBridgeNum_(get(row, 'cleared')), cleared_reason: get(row, 'reason') ? String(get(row, 'reason')) : null };
      if (s1.old !== null || s1.new !== null || s1.frozen !== null || s1.qty !== null) rows1.push(Object.assign(s1, common));
      if (s2.old !== null || s2.new !== null || s2.frozen !== null || s2.qty !== null || s2.cleared_qty) rows2.push(Object.assign(s2, common));
    });
    if (rows1.length) out.push({ business_date: date, shift: 1, area: area, saved_by: who, saved_at: at, rows: rows1 });
    if (rows2.length) out.push({ business_date: date, shift: 2, area: area, saved_by: who, saved_at: at, rows: rows2 });
    if (rowsW.length) out.push({ business_date: date, shift: 'W', area: 'Weekly', saved_by: who, saved_at: at, rows: rowsW });
  });
  return out;
}

/** What each heading (or LAYOUT key) means. */
var PORTAL_BRIDGE_KEYS = [
  ['expOld', /(exp|expiry|expires).*old|old.*(exp|expiry|expires)/],
  ['expNew', /(exp|expiry|expires).*new|new.*(exp|expiry|expires)/],
  ['s2frozen', /(s2|shift ?2|closing).*frozen|frozen.*(s2|shift ?2|closing)/],
  ['s1old', /(s1|shift ?1|morning).*old|old.*(s1|shift ?1|morning)/],
  ['s1new', /(s1|shift ?1|morning).*new|new.*(s1|shift ?1|morning)/],
  ['s2old', /(s2|shift ?2|closing).*old|old.*(s2|shift ?2|closing)/],
  ['s2new', /(s2|shift ?2|closing).*new|new.*(s2|shift ?2|closing)/],
  ['frozen', /frozen/],
  ['cleared', /clear|thrown|waste/],
  ['reason', /reason|why/],
  ['shift1', /^(s1|shift ?1|morning)/],
  ['shift2', /^(s2|shift ?2|closing)/],
  ['qty', /count|qty|quantity|stock|amount/],
  ['item', /^(item|name|product)/],
];

function portalBridgeKeyOf_(label) {
  var t = String(label || '').toLowerCase().replace(/[_\-]+/g, ' ').trim();
  for (var i = 0; i < PORTAL_BRIDGE_KEYS.length; i++) if (PORTAL_BRIDGE_KEYS[i][1].test(t)) return PORTAL_BRIDGE_KEYS[i][0];
  return null;
}

function portalBridgeColNum_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(s)) return null;
  var n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

/** Columns for a tab: from PORTAL_BRIDGE_TABS, then your LAYOUT, then the headings in the tab. */
function portalBridgeColumns_(area) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(area) || ss.getSheets().filter(function (s) { return s.getName().toLowerCase().indexOf(area.toLowerCase()) === 0; })[0];
  if (!sheet) return null;
  var cols = { sheet: sheet.getName(), firstRow: 2 };
  var manual = PORTAL_BRIDGE_TABS[area];
  var layout = null;
  try { layout = (typeof LAYOUT !== 'undefined' && LAYOUT) ? (LAYOUT[area] || LAYOUT[area.toUpperCase()] || LAYOUT[area.toLowerCase()]) : null; } catch (e) { layout = null; }
  var source = manual || layout;
  if (source && typeof source === 'object') {
    Object.keys(source).forEach(function (k) {
      var v = source[k];
      if (/^(first|start|data)\s*row$|^(firstrow|startrow|datarow)$/i.test(k)) { cols.firstRow = Number(v); return; }
      if (/^headerrow$/i.test(k)) { cols.firstRow = Number(v) + 1; return; }
      var key = manual ? k : portalBridgeKeyOf_(k);
      var n = portalBridgeColNum_(v);
      if (key && n && !cols[key]) cols[key] = n;
    });
    if (cols.item) return cols;
  }
  // Headings: look at the first 6 rows for a row that names the item column
  var head = sheet.getRange(1, 1, Math.min(6, sheet.getLastRow() || 1), sheet.getLastColumn() || 1).getValues();
  for (var r = 0; r < head.length; r++) {
    var found = {};
    head[r].forEach(function (cell, c) { var key = portalBridgeKeyOf_(cell); if (key && !found[key]) found[key] = c + 1; });
    if (found.item) { found.sheet = cols.sheet; found.firstRow = r + 2; return found; }
  }
  return null;
}

function portalBridgeNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function portalBridgeDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Dubai', 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return null;
}

function portalBridgeLog_(result, details) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(PORTAL_BRIDGE_LOG) || ss.insertSheet(PORTAL_BRIDGE_LOG);
    if (sheet.getLastRow() === 0) sheet.appendRow(['Time (Dubai)', 'Result', 'Details']);
    sheet.appendRow([Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyyy-MM-dd HH:mm:ss'), result, details]);
  } catch (e) {
    // Never block the staff save, even if logging fails.
  }
}
