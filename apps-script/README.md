# Google Sheet scripts (staff app and bridge)

The live versions of these files are in the Apps Script project of the Title Brew TEST sheet
(Extensions > Apps Script). That project is the master copy.

- `PortalBridge.gs`: same as the live version.
- `Orders.gs`: new (Orders screen for staff allowed to send orders). Its screen goes into the live Page.html.
- `Deliveries.gs` and `Page.html`: OLDER than the live versions. They were changed further in
  the Claude chat (expiry handling after deliveries, manager PIN, Done screens, search box).
  Do not paste these over the live files.

Before changing any of these files, copy the current version from Apps Script first and work
from that.

Live project files: Code.gs, StaffPage.gs, Page.html, Deliveries.gs, PortalBridge.gs.
After a change: Deploy > Manage deployments > pencil > Version: New version > Deploy.
