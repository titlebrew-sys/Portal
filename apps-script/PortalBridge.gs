/**
 * Title Brew portal bridge: sends today's counts from this Google Sheet to the portal.
 * Made for the Title Brew daily ordering script (same LAYOUT, FIRST_ROW 8, date in Bar!C2).
 *
 * Add this as a NEW script file called "PortalBridge". Your other files stay as they are.
 * Settings are kept in Script Properties (Project Settings > Script Properties), never in code:
 *   PORTAL_BRIDGE_URL     https://<your project>.supabase.co/functions/v1/sheet-counts
 *   PORTAL_BRIDGE_SECRET  the same text as the Supabase secret BRIDGE_SECRET
 *
 * Then add one line at the very end of saveShift1, saveShift2 and the staff page save (spSave):
 *   portalBridgeSend();
 *
 * It never stops a save: every problem is caught and written to the "Bridge Log" tab.
 * Run portalBridgeTest() first: it writes what it would send to "Bridge Log", without sending.
 */

/** Same as LAYOUT in the ordering script; used only if that one cannot be read. */
var PORTAL_BRIDGE_LAYOUT = {
  Bar: { s1a: 4, s2a: 5 },
  Kitchen: { s1a: 5, s1b: 6, s1c: 11, s2a: 7, s2b: 9, s2c: 12, expOld: 3, expNew: 4, rsn: 8 },
  Weekly: { s1a: 4 },
};
var PORTAL_BRIDGE_FIRST_ROW = 8;
var PORTAL_BRIDGE_TZ = 'Asia/Dubai';
var PORTAL_BRIDGE_REASONS = ['Expired', 'Damaged', 'Not sold'];
var PORTAL_BRIDGE_LOG = 'Bridge Log';

/** Sends today's Bar, Kitchen and Weekly counts. Safe to call as often as you like. */
function portalBridgeSend(savedBy) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('PORTAL_BRIDGE_URL');
    var secret = props.getProperty('PORTAL_BRIDGE_SECRET');
    if (!url || !secret) { portalBridgeLog_('Not sent', 'Add PORTAL_BRIDGE_URL and PORTAL_BRIDGE_SECRET in Script Properties.'); return; }
    var batches = portalBridgeBatches_(savedBy);
    if (!batches.length) { portalBridgeLog_('Nothing to send', 'No counts on the sheet yet today.'); return; }
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
    var batches = portalBridgeBatches_('Test');
    if (!batches.length) portalBridgeLog_('Test', 'No counts on the sheet yet today.');
    batches.forEach(function (b) {
      portalBridgeLog_('Test: ' + b.area + ' shift ' + b.shift + ' (' + b.business_date + ')', b.rows.length + ' items. First 3: ' + JSON.stringify(b.rows.slice(0, 3)));
    });
  } catch (e) {
    portalBridgeLog_('Test error', String(e && e.message ? e.message : e));
  }
}

// ---------------------------------------------------------------- reading the tabs

function portalBridgeLayout_() {
  try { if (typeof LAYOUT !== 'undefined' && LAYOUT && LAYOUT.Kitchen) return LAYOUT; } catch (e) { /* use the copy */ }
  return PORTAL_BRIDGE_LAYOUT;
}

function portalBridgeBatches_(savedBy) {
  var ss = SpreadsheetApp.getActive();
  var L = portalBridgeLayout_();
  var tz = PORTAL_BRIDGE_TZ;
  var date = ss.getSheetByName('Bar').getRange('C2').getValue();
  if (Object.prototype.toString.call(date) !== '[object Date]') throw new Error('Bar C2 does not hold a date');
  var day = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  var weekly = ss.getSheetByName('Weekly');
  var weeklyDate = weekly ? weekly.getRange('C2').getValue() : '';
  var weeklyToday = Object.prototype.toString.call(weeklyDate) === '[object Date]' && Utilities.formatDate(weeklyDate, tz, 'yyyy-MM-dd') === day;
  var who = savedBy || 'Google Sheet';
  var at = new Date().toISOString();

  // Kitchen items with a shelf life (Rules column Z) keep an old and a new batch
  var shelf = {};
  var rules = ss.getSheetByName('Rules');
  if (rules && rules.getLastRow() >= 5) {
    rules.getRange(5, 1, rules.getLastRow() - 4, 26).getValues().forEach(function (r) { if (Number(r[25]) > 0) shelf[String(r[2])] = true; });
  }

  var out = [];
  var add = function (area, shift, rows) { if (rows.length) out.push({ business_date: day, shift: shift, area: area, saved_by: who, saved_at: at, rows: rows }); };
  var read = function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < PORTAL_BRIDGE_FIRST_ROW) return [];
    return sh.getRange(PORTAL_BRIDGE_FIRST_ROW, 1, sh.getLastRow() - PORTAL_BRIDGE_FIRST_ROW + 1, 14).getValues().filter(portalBridgeIsItem_);
  };
  var n = portalBridgeNum_;

  // Bar: one number per shift
  var bar1 = [], bar2 = [];
  read('Bar').forEach(function (r) {
    var g = function (c) { return c ? r[c - 1] : ''; };
    if (n(g(L.Bar.s1a)) !== null) bar1.push({ item: String(r[1]), qty: n(g(L.Bar.s1a)) });
    if (n(g(L.Bar.s2a)) !== null) bar2.push({ item: String(r[1]), qty: n(g(L.Bar.s2a)) });
  });
  add('Bar', 1, bar1);
  add('Bar', 2, bar2);

  // Kitchen: old, new and frozen, with expiry dates; a reason in column H means the Shift 2 "old" number was thrown away
  var K = L.Kitchen, k1 = [], k2 = [];
  read('Kitchen').forEach(function (r) {
    var g = function (c) { return c ? r[c - 1] : ''; };
    var item = String(r[1]), sec = String(r[0]);
    var reason = String(g(K.rsn));
    var cleared = PORTAL_BRIDGE_REASONS.indexOf(reason) >= 0 ? (n(g(K.s2a)) || 0) : null;
    var exp = { old_expiry: portalBridgeDate_(g(K.expOld)), new_expiry: portalBridgeDate_(g(K.expNew)) };
    var s1, s2;
    if (sec === 'Croissants') {
      s1 = { old: n(g(K.s1a)), new: n(g(K.s1b)), frozen: n(g(K.s1c)) };
      s2 = { old: cleared !== null ? 0 : n(g(K.s2a)), new: n(g(K.s2b)), frozen: n(g(K.s2c)) };
    } else if (sec.indexOf('Track') >= 0) {
      s1 = { qty: n(g(K.s1a)) };
      s2 = { qty: n(g(K.s2a)) };
    } else if (shelf[item]) {
      s1 = { old: n(g(K.s1a)), new: n(g(K.s1b)) };
      s2 = { old: cleared !== null ? 0 : n(g(K.s2a)), new: n(g(K.s2b)) };
    } else {
      // No shelf life (e.g. energy balls): Shift 2 old is only used for thrown away pieces
      s1 = { old: n(g(K.s1a)), new: n(g(K.s1b)) };
      s2 = { new: n(g(K.s2b)) };
    }
    var any = function (o) { return Object.keys(o).some(function (key) { return o[key] !== null && o[key] !== undefined; }); };
    if (any(s1)) k1.push(Object.assign({ item: item }, s1, exp));
    if (any(s2) || cleared) k2.push(Object.assign({ item: item }, s2, exp, cleared ? { cleared_qty: cleared, cleared_reason: reason } : {}));
  });
  add('Kitchen', 1, k1);
  add('Kitchen', 2, k2);

  // Weekly: only when the weekly count date (Weekly C2) is today
  if (weeklyToday) {
    var w = [];
    read('Weekly').forEach(function (r) {
      var v = n(r[L.Weekly.s1a - 1]);
      if (v !== null) w.push({ item: String(r[1]), qty: v });
    });
    if (w.length) out.push({ business_date: day, shift: 'W', area: 'Weekly', saved_by: who, saved_at: at, rows: w });
  }
  return out;
}

/** Same rule as the ordering script: a section name in column A (not capitals) and an item in column B. */
function portalBridgeIsItem_(r) { return r[0] && r[1] && String(r[0]) !== String(r[0]).toUpperCase(); }

function portalBridgeNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var x = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(x) ? null : x;
}

function portalBridgeDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, PORTAL_BRIDGE_TZ, 'yyyy-MM-dd');
  return null;
}

function portalBridgeLog_(result, details) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(PORTAL_BRIDGE_LOG) || ss.insertSheet(PORTAL_BRIDGE_LOG);
    if (sheet.getLastRow() === 0) sheet.appendRow(['Time (Dubai)', 'Result', 'Details']);
    sheet.appendRow([Utilities.formatDate(new Date(), PORTAL_BRIDGE_TZ, 'yyyy-MM-dd HH:mm:ss'), result, details]);
  } catch (e) {
    // Never block a save, even if logging fails.
  }
}
