/**
 * Title Brew staff app: Orders screen (server side). Only for staff allowed to send orders.
 * Add this as a NEW script file called "Orders". It reuses TZ (Code) and spWho (StaffPage).
 *
 * Who can see it: on the Staff tab, column C "Manager" = Y, or column D "Can send orders" = Y.
 * "Can send orders" gives no other rights: counting locks still apply as usual.
 *
 * For each supplier with something to order today it gives the message from Today's Orders,
 * so the app can show Copy and Open WhatsApp buttons. Each tap on Open WhatsApp is written to
 * the "Order Log" tab (who, when, which supplier).
 */

var OR_LOG = 'Order Log';

/** True when the person is a manager (column C) or may send orders (column D). */
function orCanSend_(name) {
  var st = SpreadsheetApp.getActive().getSheetByName('Staff');
  if (!st || st.getLastRow() < 2) return false;
  var rows = st.getRange(2, 1, st.getLastRow() - 1, 4).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== name) continue;
    return String(rows[i][2]).trim().toUpperCase() === 'Y' || String(rows[i][3]).trim().toUpperCase() === 'Y';
  }
  return false;
}

/** How each supplier is ordered, from the Suppliers tab (A name, C email). */
function orSuppliers_() {
  var sup = SpreadsheetApp.getActive().getSheetByName('Suppliers');
  var out = {};
  if (!sup || sup.getLastRow() < 5) return out;
  sup.getRange(5, 1, sup.getLastRow() - 4, 3).getDisplayValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = { how: String(r[1] || '').trim(), email: String(r[2] || '').trim() !== '' };
  });
  return out;
}

function spOrders(token) {
  var name = spWho(token);
  if (!name) return { expired: true };
  if (!orCanSend_(name)) return { ok: false, allowed: false };
  var ss = SpreadsheetApp.getActive();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 6) return { ok: true, allowed: true, saturday: true, suppliers: [] };
  var to = ss.getSheetByName("Today's Orders");
  if (!to || to.getLastRow() < 2) return { ok: true, allowed: true, suppliers: [] };
  var n = to.getLastRow();
  var vals = to.getRange(1, 1, n, 17).getValues();
  var shown = to.getRange(1, 1, n, 17).getDisplayValues();
  var how = orSuppliers_();
  var out = [], cur = null;
  for (var i = 0; i < n; i++) {
    var a = String(vals[i][0]);
    // A supplier block starts with its name, then a row with "Item"
    if (a && i + 1 < n && String(vals[i + 1][0]) === 'Item') {
      cur = { name: a, how: (how[a] || {}).how || '', email: !!(how[a] || {}).email, items: [], message: '' };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (a === 'Message') { cur.message = String(shown[i][1] || '').trim(); continue; }
    if (vals[i][16] && a) {                       // column Q holds the rule on item rows only
      var qty = Number(vals[i][5]) || 0;          // column F final order
      if (qty > 0) cur.items.push({ item: a, qty: qty });
    }
  }
  return {
    ok: true, allowed: true, saturday: false,
    delivery: String(to.getRange('B3').getDisplayValue() || ''),
    suppliers: out.filter(function (s) { return s.items.length > 0; }),
    nothing: out.filter(function (s) { return !s.items.length; }).map(function (s) { return s.name; }),
  };
}

/** Writes who opened WhatsApp (or copied the message) for which supplier, and when. */
function spOrderLog(token, supplier, action) {
  var name = spWho(token);
  if (!name || !orCanSend_(name)) return { ok: false };
  var ss = SpreadsheetApp.getActive();
  var log = ss.getSheetByName(OR_LOG);
  if (!log) {
    log = ss.insertSheet(OR_LOG);
    log.getRange(1, 1, 1, 4).setValues([['When', 'Staff', 'Supplier', 'Action']]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 150); log.setColumnWidth(3, 180);
  }
  log.appendRow([new Date(), name, String(supplier).slice(0, 80), action === 'copy' ? 'Copied the message' : 'Opened WhatsApp']);
  log.getRange(log.getLastRow(), 1).setNumberFormat('ddd d mmm, h:mm am/pm');
  return { ok: true };
}
