/**
 * Title Brew portal bridge: sends today's counts from this Google Sheet to the portal.
 * Made for the Title Brew daily ordering script (same LAYOUT, FIRST_ROW 8, date in Bar!C2).
 * Sends: today's counts (Bar, Kitchen, Weekly), the last 2 days from the History tab, and the
 * day's final orders (Today's Orders), which the portal takes as delivered the next morning.
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
    var batches = portalBridgeBatches_(savedBy).concat(portalBridgeHistory_());
    var orders = portalBridgeOrders_();
    if (!batches.length && !orders.length) { portalBridgeLog_('Nothing to send', 'No counts on the sheet yet today.'); return; }
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-bridge-secret': secret },
      payload: JSON.stringify({ batches: batches, orders: orders }),
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
    var batches = portalBridgeBatches_('Test').concat(portalBridgeHistory_());
    if (!batches.length) portalBridgeLog_('Test', 'No counts found.');
    batches.forEach(function (b) {
      portalBridgeLog_('Test: ' + b.area + ' shift ' + b.shift + ' (' + b.business_date + ')', b.rows.length + ' items. First 3: ' + JSON.stringify(b.rows.slice(0, 3)));
    });
    portalBridgeOrders_().forEach(function (o) {
      portalBridgeLog_('Test: orders ' + o.business_date, o.items.length + ' items. First 3: ' + JSON.stringify(o.items.slice(0, 3)));
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

  // Kitchen items with a shelf life (Rules column Z) keep an old and a new batch
  var shelf = {};
  var rules = ss.getSheetByName('Rules');
  if (rules && rules.getLastRow() >= 5) {
    rules.getRange(5, 1, rules.getLastRow() - 4, 26).getValues().forEach(function (r) { if (Number(r[25]) > 0) shelf[String(r[2])] = true; });
  }

  var out = [];
  var add = function (area, shift, rows) { if (rows.length) out.push({ business_date: day, shift: shift, area: area, saved_by: who, saved_at: portalBridgeCountTime_(day, shift), rows: rows }); };
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
    if (w.length) out.push({ business_date: day, shift: 'W', area: 'Weekly', saved_by: who, saved_at: portalBridgeCountTime_(day, 1), rows: w });
  }
  return out;
}

/**
 * When the count is taken as made: Shift 1 at 4pm, Shift 2 at closing
 * (9pm on weekdays, 8pm on Saturday and Sunday). Dubai time.
 */
function portalBridgeCountTime_(day, shift) {
  var weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  var close = weekday === 0 || weekday === 6 ? '20' : '21';
  return new Date(day + 'T' + (shift === 2 ? close : '16') + ':00:00+04:00').toISOString();
}

function portalBridgeDayKey_(d) { return Utilities.formatDate(d, PORTAL_BRIDGE_TZ, 'yyyy-MM-dd'); }

/** The last 2 days from the History tab (each day: Shift 1, Shift 2, Expiry, Cleared). */
function portalBridgeHistory_() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName('History');
  var bar = ss.getSheetByName('Bar');
  if (!h || !bar || h.getLastRow() < 3 || h.getLastColumn() < 3) return [];
  var today = bar.getRange('C2').getValue();
  if (Object.prototype.toString.call(today) !== '[object Date]') return [];
  var todayKey = portalBridgeDayKey_(today);
  var width = h.getLastColumn();
  var dates = h.getRange(1, 1, 1, width).getValues()[0];
  var labels = h.getRange(2, 1, 1, width).getValues()[0];
  var body = h.getRange(3, 1, h.getLastRow() - 2, width).getValues();
  var out = [];
  // Which tab each item is on (History column A may hold a section name like "Croissants")
  var areaOf = {};
  ['Bar', 'Kitchen', 'Weekly'].forEach(function (a) {
    var sh = ss.getSheetByName(a);
    if (!sh || sh.getLastRow() < PORTAL_BRIDGE_FIRST_ROW) return;
    sh.getRange(PORTAL_BRIDGE_FIRST_ROW, 1, sh.getLastRow() - PORTAL_BRIDGE_FIRST_ROW + 1, 2).getValues().forEach(function (r) {
      if (portalBridgeIsItem_(r)) areaOf[String(r[1])] = a;
    });
  });
  var wanted = [1, 2].map(function (n) {
    var d = new Date(Date.parse(todayKey + 'T12:00:00Z') - n * 864e5);
    return d.toISOString().slice(0, 10);
  });
  wanted.forEach(function (day) {
    var c = -1;
    for (var i = 2; i < width; i++) {
      if (String(labels[i]) === 'Shift 1' && Object.prototype.toString.call(dates[i]) === '[object Date]' && portalBridgeDayKey_(dates[i]) === day) { c = i; break; }
    }
    if (c < 0) return;
    var groups = {};
    var push = function (area, shift, row) {
      var k = area + '|' + shift;
      if (!groups[k]) groups[k] = { business_date: day, shift: shift, area: area, saved_by: 'Google Sheet (History)', saved_at: portalBridgeCountTime_(day, shift === 'W' ? 1 : shift), rows: [] };
      groups[k].rows.push(row);
    };
    body.forEach(function (r) {
      var item = String(r[1]);
      var area = areaOf[item] || String(r[0]);
      if (!item || ['Bar', 'Kitchen', 'Weekly'].indexOf(area) < 0) return;
      var s1 = r[c], s2 = r[c + 1], exp = String(r[c + 2] || ''), cleared = String(r[c + 3] || '');
      if (area === 'Weekly') { var w = portalBridgeNum_(s1); if (w !== null) push('Weekly', 'W', { item: item, qty: w }); return; }
      if (area === 'Bar') {
        if (portalBridgeNum_(s1) !== null) push('Bar', 1, { item: item, qty: portalBridgeNum_(s1) });
        if (portalBridgeNum_(s2) !== null) push('Bar', 2, { item: item, qty: portalBridgeNum_(s2) });
        return;
      }
      var e = portalBridgeExpiry_(exp, day);
      var cl = cleared.match(/(^|;)\s*([\d.]+)\s+(expired|damaged|not sold)/i);
      var clearedQty = cl ? Number(cl[2]) : null;
      var reason = cl ? PORTAL_BRIDGE_REASONS.filter(function (x) { return x.toLowerCase() === cl[3].toLowerCase(); })[0] : null;
      var a = portalBridgeParseCount_(s1);
      if (a) push('Kitchen', 1, Object.assign({ item: item }, a, e));
      var b = portalBridgeParseCount_(s2);
      if (b && clearedQty !== null && b.old !== undefined) b.old = 0; // the old number was what was thrown away
      if (b || clearedQty) push('Kitchen', 2, Object.assign({ item: item }, b || {}, e, clearedQty ? { cleared_qty: clearedQty, cleared_reason: reason } : {}));
    });
    Object.keys(groups).forEach(function (k) { out.push(groups[k]); });
  });
  return out;
}

/** "0 old, 2 new, 22 frozen" / "1 old, 3 new" / "5" -> parts; '' -> null. */
function portalBridgeParseCount_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return { qty: v };
  var s = String(v);
  var m = s.match(/([\d.]+)\s*old,\s*([\d.]+)\s*new(?:,\s*([\d.]+)\s*frozen)?/i);
  if (m) return m[3] !== undefined ? { old: Number(m[1]), new: Number(m[2]), frozen: Number(m[3]) } : { old: Number(m[1]), new: Number(m[2]) };
  var n = portalBridgeNum_(s);
  return n === null ? null : { qty: n };
}

/** "4 Nov / 6 Nov" -> old and new expiry dates (year taken from the count day). */
function portalBridgeExpiry_(text, day) {
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var parse = function (p) {
    var m = String(p || '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    if (!m) return null;
    var mon = months.indexOf(m[2].toLowerCase());
    if (mon < 0) return null;
    var y = Number(day.slice(0, 4));
    if (mon === 0 && day.slice(5, 7) === '12') y++;
    if (mon === 11 && day.slice(5, 7) === '01') y--;
    return y + '-' + ('0' + (mon + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  };
  var parts = String(text || '').split('/');
  return { old_expiry: parse(parts[0]), new_expiry: parse(parts[1]) };
}

/**
 * Final orders, in count units: today's from Today's Orders (final order x count units per order unit),
 * yesterday's milk and bakery orders from the Usage Log. The portal takes them as delivered next morning.
 */
function portalBridgeOrders_() {
  var ss = SpreadsheetApp.getActive();
  var bar = ss.getSheetByName('Bar');
  var today = bar ? bar.getRange('C2').getValue() : '';
  if (Object.prototype.toString.call(today) !== '[object Date]') return [];
  var todayKey = portalBridgeDayKey_(today);
  var out = [];
  // Title Brew orders nothing on Saturday (no Sunday deliveries): Friday orders for Saturday, Sunday for Monday
  var isSaturday = function (key) { return new Date(key + 'T12:00:00Z').getUTCDay() === 6; };
  var to = ss.getSheetByName("Today's Orders");
  // Only from 4pm: before the Shift 1 count the tab shows suggestions from empty counts
  var hourNow = Number(Utilities.formatDate(new Date(), PORTAL_BRIDGE_TZ, 'H'));
  if (to && to.getLastRow() > 0 && hourNow >= 16 && !isSaturday(todayKey)) {
    var items = [];
    to.getRange(1, 1, to.getLastRow(), 19).getValues().forEach(function (r) {
      // A item, F final order, Q rule, S count units per order unit
      if (!r[0] || !r[16]) return;
      var qty = (Number(r[5]) || 0) * (Number(r[18]) || 1);
      if (qty > 0) items.push({ order_item: String(r[0]), count_qty: qty });
    });
    if (items.length) out.push({ business_date: todayKey, items: items });
  }
  var log = ss.getSheetByName('Usage Log');
  if (log && log.getLastRow() >= 2) {
    var yKey = new Date(Date.parse(todayKey + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    var yItems = [];
    log.getRange(2, 1, log.getLastRow() - 1, 5).getValues().forEach(function (r) {
      // date, item, stock good for tomorrow, total stock, ordered (count units)
      if (Object.prototype.toString.call(r[0]) === '[object Date]' && portalBridgeDayKey_(r[0]) === yKey && Number(r[4]) > 0) yItems.push({ order_item: String(r[1]), count_qty: Number(r[4]) });
    });
    // Only milk and bakery (the Usage Log), so it must not remove yesterday's other supplier orders
    if (yItems.length && !isSaturday(yKey)) out.push({ business_date: yKey, items: yItems, partial: true });
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
