# Handover (11 Nov 2026)

Read `CLAUDE.md`, `NEXT.md` and `next-steps.md` first. Branch: `claude/friendly-bohr-loihqz`. Arsen is the café manager, not technical: short plain answers, click-by-click steps, no em dashes, say which files changed. For Apps Script he wants whole files to copy and paste (he can use "Copy raw file" on GitHub). Never open a pull request unless he asks. Commit as titlebrew-sys (see CLAUDE.md).

## Done this session (all pushed)
- **Cold brew question** in the staff app at both Bar shifts ("Yes, 180 g used" / "Not made"), saved to the "Cold Brew Log" tab (`apps-script/ColdBrew.gs`, `StaffPage.gs`, `Page.html`). Bridge sends it as `cold_brew`; table `cold_brew_log` (`supabase/cold-brew.sql`). Portal: each "Yes" uses 180 g Ethiopia (`coldBrewUsage` in `src/lib/usage.ts`). No answer = Not made = 0 g. Cold Brew and Nitro recipes no longer carry bean lines.
- **Real roast weights**: owner enters bean, date, grams on Stock page (Roasts panel). Table `roasts` (`supabase/roasts.sql`). Replaces the assumed roast. Per-origin limit `roastRiseG`: Brazil and Ethiopia 3000 g, others 800 g. Assumed roast and small shortfalls show amber.
- **Lighter Portal**: removed Count, Orders, Deliveries and Receive pages (about 4 percent smaller JS, no real speed change). Remaining pages: Today, Waste, Stock, Differences, Recipes, Sales, Items and rules, How it works.
- **Arrivals only from the staff app**: `src/lib/stock.ts` (`isAssumedDelivery`) ignores orders whose `receivedBy` starts with "Google Sheet (taken as delivered". Only confirmed deliveries and "not ordered" arrivals count. Page.html now calls `spSendToPortal` after Confirm delivery and Add arrival.
- **Pack sizes follow the sheet**: `PortalBridge.gs` sends Rules column B and K as `pack_sizes`; `supabase/functions/sheet-counts/index.ts` updates `rules.pack_size` (blank or zero cells skipped). Reason: oat milk case showed 24,000 ml (Portal copy said 12, sheet says 8).
- 85 tests pass (`npx vitest run`).

## Arsen's last deploy (he said "done")
PortalBridge.gs and Page.html pasted, new version deployed, `sheet-counts` redeployed. Not yet verified: Bridge Log shows "Sent" with "N pack sizes updated from the sheet", and Stock shows 16,000 ml for the 2 oat milk cases on 11 Nov.

## To verify next
- Oat milk on Stock/Differences after the next count Save. Check Coconut and Almond milk pack sizes too (Rules column K in the sheet).
- Banana walnut oats: arrived should now be 0 until staff confirm. Ask whether old stock thrown away at Shift 2 is typed in Kitchen column M (the 10 Nov count was 3 with 0 thrown).
- Cold brew: after a Bar count Save, Bridge Log "Sent" mentions cold brew answers; Stock Ethiopia beans shows a 180 g "Cold brew batch" line for a Yes.
- Roasts: Arsen still needs to run `supabase/roasts.sql` (if not done), then enter Brazil 14,200 g on 10 Nov (difference should become -54 g) and the real Ethiopia roast weight (unknown).

## Open gaps and questions
- A confirmed delivery's order date is guessed as the day before (`deliveriesForPortal_`). Late deliveries could be matched wrong and double count. Arsen said some suppliers deliver late ("others") but did not name them. Ask which, then fix.
- Staff confirm deliveries the same day only, and thrown away is written at Shift 2 (both fine as built).
- Milk amounts conflict: chat notes say 200 ml dine in and takeaway, 313 ml large, iced 150 ml, +Size 250 ml total; built 214 and 322 ml. Arsen has not answered.
- Not done from `next-steps.md`: combined Almond Cookies line, Global Beverages 150 AED logic, order total warnings, Emirates free coconut case tracker, SAFCO amount in message, Friday 13 Nov milk row note (Arsen), Coconut Truffles rounding (21 not 22), Hotpack prices (Arsen to send). Item 14 mentioned by Arsen does not exist anywhere.
- Earlier reminder still owed: check the "about/approximately" shop numbers (listed in `NEXT.md`).
- Optional: ask if more Portal pages should go.

## How things connect
- APP = Google Apps Script staff site inside the Sheet "Title Brew TEST". The live Apps Script project is the master; `apps-script/` files are copies (the 11 Nov `Page.html` and `StaffPage.gs` match live plus our changes). Ask Arsen for the live file before changing one he may have edited.
- Bridge: `PortalBridge.gs` posts to the edge function `sheet-counts` with header `x-bridge-secret` (kept in Script Properties, never in the repo). Counts are placed at fixed times (Shift 1 4pm, Shift 2 9pm weekdays or 8pm Sat-Sun, Dubai). `PortalOrders.gs` sends only the Today's Orders copy every 10 minutes.
- Portal keeps its own copy of rules, ingredients and recipes in Supabase. Pack sizes now sync from the sheet; everything else in Items and rules is still separate.
- Stock engine: expected = last count + arrived - used by sales - thrown away; difference = counted - expected. New tables need SQL run by Arsen in the Supabase SQL Editor; edge function changes need him to redeploy.
- Security: the repo is public. No keys, tokens or PINs in code. Never write Rhobel's PIN anywhere. Do not ask for the Staff tab.
