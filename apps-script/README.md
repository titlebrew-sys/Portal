# Google Sheet scripts (staff app and bridge)

The live versions of these files are in the Apps Script project of the Title Brew TEST sheet
(Extensions > Apps Script). That project is the master copy.

- `PortalBridge.gs`: same as the live version.
- `Orders.gs`: new. The "Place Order for tomorrow" screen, only for Staff with column C
  "Manager" = Y or column D "Can send orders" = Y. Column D gives no other rights.
- `Page.html`: the live version from 7 Nov 2026 (manager note, Done screens, search box) plus
  the "Place Order for tomorrow" screen.
- `Deliveries.gs`: OLDER than the live version (changed further in the Claude chat).
  Do not paste it over the live file.

Before changing any of these files, copy the current version from Apps Script first and work
from that.

Live project files: Code.gs, StaffPage.gs, Page.html, Deliveries.gs, PortalBridge.gs, Orders.gs.
After a change: Deploy > Manage deployments > pencil > Version: New version > Deploy.
