/**
 * Title Brew portal: copy of the sheet's Today's Orders for the Portal's Orders page (10 Nov 2026).
 * Add this as a NEW script file called "PortalOrders". Do not change any other file.
 *
 * It uses what is already in the project: the same functions the staff app's Orders screen uses to read the
 * Today's Orders tab (Orders.gs), and the bridge settings (PORTAL_BRIDGE_URL, PORTAL_BRIDGE_SECRET in
 * Script Properties) and portalBridgeLog_ from PortalBridge.gs.
 *
 * Run portalBridgeSetupOrdersTrigger ONCE. After that the sheet sends Today's Orders every 10 minutes.
 * It never changes the sheet and never stops anything: every problem is caught and written to "Bridge Log".
 */

/**
 * A copy of the whole Today's Orders tab, read with the same functions the staff app's Orders screen uses
 * (Orders.gs), so the Portal shows exactly what the sheet shows. Returns null if Orders.gs or the tab is missing.
 * Only supplier names, the sheet's numbers and messages are sent. Nothing from the Staff tab.
 */
function portalBridgeSheetOrders_() {
  try {
    if (typeof orBlocks_ !== 'function' || typeof orBlockData_ !== 'function') return null;
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName("Today's Orders");
    if (!sh || sh.getLastRow() < 2) return null;
    var sups = orSuppliers_(), done = orDoneToday_();
    var list = orBlocks_().map(function (b) {
      var d = orBlockData_(sh, b, sups, done);
      return {
        name: d.name, how: d.how, status: d.status, done: d.done, message: d.message, toOrder: d.toOrder,
        rows: d.rows.map(function (r) {
          return { item: r.item, count: r.count, unit: r.unit, suggested: r.suggested, change: r.change, final: r.final, orderUnit: r.orderUnit, notes: r.notes, coming: r.coming };
        })
      };
    });
    return {
      countDate: String(sh.getRange('B2').getDisplayValue()),
      delivery: String(sh.getRange('B3').getDisplayValue()),
      note: String(sh.getRange('D2').getDisplayValue()),
      notCounted: String(sh.getRange('B4').getDisplayValue()),
      saturday: Utilities.formatDate(new Date(), PORTAL_BRIDGE_TZ, 'u') === '6',
      suppliers: list
    };
  } catch (e) {
    portalBridgeLog_('Orders copy', String(e && e.message ? e.message : e));
    return null;
  }
}

/** Sends only the copy of Today's Orders. Runs every 10 minutes (see portalBridgeSetupOrdersTrigger). Only problems are logged. */
function portalBridgeSendOrders() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('PORTAL_BRIDGE_URL');
    var secret = props.getProperty('PORTAL_BRIDGE_SECRET');
    if (!url || !secret) return;
    var mirror = portalBridgeSheetOrders_();
    if (!mirror) return;
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-bridge-secret': secret },
      payload: JSON.stringify({ batches: [], sheet_orders: mirror }),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code !== 200) portalBridgeLog_('Orders problem (' + code + ')', res.getContentText().slice(0, 900));
  } catch (e) {
    portalBridgeLog_('Orders error', String(e && e.message ? e.message : e));
  }
}

/**
 * Run this ONCE (select it in the function list, press Run, and allow access when Google asks).
 * It makes the sheet send Today's Orders to the Portal every 10 minutes, so changes made in the staff app
 * show on the Portal without waiting for a count. Running it again only replaces the same timer.
 */
function portalBridgeSetupOrdersTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'portalBridgeSendOrders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('portalBridgeSendOrders').timeBased().everyMinutes(10).create();
  portalBridgeSendOrders();
  portalBridgeLog_('Orders timer set', "Today's Orders will be sent to the Portal every 10 minutes.");
}
