# Google Sheet scripts (staff app and bridge)

The live versions of these files are in the Apps Script project of the Title Brew TEST sheet
(Extensions > Apps Script). That project is the master copy. Before changing any file, ask Arsen for the live version.

After a change: Deploy > Manage deployments > pencil > Version: New version > Deploy.

## State of the copies (11 Nov 2026)

On 11 Nov 2026 Arsen pasted all 8 live files into the chat. Each repo copy was checked against them.

Matching live (checked on key markers, not line by line):
- `StaffPage.gs`: sign in, counts, locks, 4am to 4am business day, Thrown away, cold brew hooks.
- `Page.html`: staff screens, Delayed / Cancelled, Place Order for Tomorrow, Download LPO and Open email, cold brew question.
- `PortalBridge.gs`: counts, History, orders, deliveries, cold brew, pack sizes (Rules column K), thrown away from column M.
- `Deliveries.gs`: Deliveries screen, Delayed / Cancelled, still coming (Today's Orders column W).
- `PortalOrders.gs`: copy of Today's Orders for the Portal, sent every 10 minutes.
- `ColdBrew.gs`: the cold brew question and the "Cold Brew Log" tab.

Replaced with the live versions on 11 Nov 2026 (the old repo copies were behind):
- `Code.gs`: now has `setupBusinessDay`, `calendarToday_`, `upgradeThrownAway` and the Kitchen column M (`s2t`).
- `Orders.gs`: now has the 11 Nov speed change (`orContext_`, `orCell_`) and the LPO "used today" rule.

## What each file does

- `Code.gs`: daily saves (5pm, 11pm, 4am), History, locks, expiry dates, Clearance Log, usage learning, order tick boxes in the sheet, Bakery email with LPO.
- `StaffPage.gs`: web app server side: PIN sign in, Home, count screens, saving counts.
- `Page.html`: the whole staff web page.
- `Deliveries.gs`: Deliveries screen and the "Deliveries" tab.
- `Orders.gs`: Place Order for Tomorrow screen (Staff tab column D "Can Send Orders" = Y), "Orders Log" tab.
- `ColdBrew.gs`: cold brew question under Ethiopia beans at the Bar count.
- `PortalBridge.gs`: sends counts and more to the Portal (Supabase edge function `sheet-counts`). Settings are in Script Properties, never in code.
- `PortalOrders.gs`: sends Today's Orders to the Portal every 10 minutes. Run `portalBridgeSetupOrdersTrigger` once.

Live project files: Code.gs, StaffPage.gs, Page.html, Deliveries.gs, PortalBridge.gs, Orders.gs, ColdBrew.gs, PortalOrders.gs.

## Notes

- `google.script.run` drops null values. Send 0 or -1 instead.
- Rhobel can place orders (column D) but is never a manager (column C).
- The Staff tab has the PINs. Never share it and never put PINs in the repo.
