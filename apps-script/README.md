# Google Sheet scripts (staff app and bridge)

The live versions of these files are in the Apps Script project of the Title Brew TEST sheet
(Extensions > Apps Script). That project is the master copy.

- `PortalBridge.gs`: live version plus `spSendToPortal` (8 Nov 2026). The live Page.html calls it
  after every Save: `call('spSendToPortal', [S.token], function () {});` in saveNow.
  Also the manager-only sheet menu "Portal > Send to Portal now" (portalBridgeAddMenu, called from
  onOpen in Code.gs; Script Property PORTAL_SEND_EMAIL = the manager's Google account).
- `Deliveries.gs`: live (9 Nov) plus Delayed / Delivery cancelled (Status column P on the Deliveries tab).
- `Orders.gs`: live version (9 Nov) plus the LPO number fix: shows the last LPO, writes the typed
  number into the LPO Number row (found by label), then makes the draft. Also staff ordering from their own email (Download LPO, Open email).
- `Page.html`: live (9 Nov) plus Delayed / Cancelled buttons and Download LPO / Open email.
  OLD NOTE: They were changed further in
  the Claude chat (expiry handling after deliveries, manager PIN, Done screens, search box).
  Do not paste these over the live files.

Before changing any of these files, copy the current version from Apps Script first and work
from that.

Live project files: Code.gs, StaffPage.gs, Page.html, Deliveries.gs, PortalBridge.gs, Orders.gs.

8 Nov 2026, changed in the Claude chat (not in this repo):
- NEW Orders.gs (live only): the "Orders for tomorrow" screen. spOrderAccess, spOrders, spSetChange,
  spOrderDraft, spOrderSent. Reads the Today's Orders tab (Count, Suggested, Your change = column E,
  Final, Message). Almarai and The Bakery get a Gmail draft (draftBakeryEmail / draftSupplierEmail in
  Code.gs); WhatsApp suppliers open WhatsApp with the message. Each order is written to "Orders Log".
- Page.html (live): "Orders for tomorrow" tile and screen added; the spSendToPortal line is kept.
- Access: Staff tab column D "Can Send Orders" = Y (Arsen and Rhobel). Column C Manager = Arsen only.
  Rhobel must never get manager rights. "Your change" editable 4am to 11pm; managers any time.
After a change: Deploy > Manage deployments > pencil > Version: New version > Deploy.

8 Nov 2026 evening, changed in the Claude chat (live Orders.gs and Page.html only):
- Screen and home tile renamed "Place Order for Tomorrow".
- "Suggested" shown as a bold coloured label on each item.
- The Bakery: above "Save as draft in Gmail" the app shows "Last LPO was N (used on <date>)" and a box
  "Write the new LPO number here". The draft button stays locked until a whole number higher than the
  last LPO is typed. The app writes it to Today's Orders B33 (Rules C2 reads it), then
  draftBakeryEmail attaches the LPO file. (Rest of this update not received yet.)
