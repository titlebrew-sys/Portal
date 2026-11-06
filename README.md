# Title Brew operations portal

Daily stock counts, supplier orders, deliveries, waste and sales for Title Brew, Business Bay.
Built with Vite, React and TypeScript. Database and login: Supabase (free tier). Hosting: Vercel (free).

## Screens

| Screen | Who | What it does |
| --- | --- | --- |
| Today | Owner, Staff | Shift 1 count status, orders to send, expiry check, stock to watch, waste |
| Count | Owner, Staff | Bar, Kitchen (old/new batch, expiry, frozen) and Weekly counts, Shift 1 and Shift 2 |
| Orders | Owner, Staff | Suggestions from today's Shift 1 count and the rules, WhatsApp and email messages, LPO for The Bakery |
| Receive | Owner, Staff | Confirm what arrived, fix short or extra items |
| Waste | Owner, Staff | Clearance log by reason |
| Sales | Owner | Loyverse "Sales by item" export analysis |
| Items and rules | Owner | Edit rules, suppliers and count items |

## Shop rules built in

- **Asia/Dubai time** on every device. **New day at 4am**. **Shift 1 locks at 5pm** (enforced in the database too; only the owner can change it after).
- **TARGET**: tops up to a target. Fixed target (e.g. 2 sandwiches, optional Saturday target for Friday orders), or daily use x days until the next-but-one delivery + extra days. Daily use is learned from counts and deliveries after 3 days of data; your estimate is used until then.
- **TOPUP**: at or below the minimum, order up to the maximum.
- **FIXED**: at or below the minimum, order a set quantity.
- **TRACK**: counted only.
- No-delivery days (Almarai and The Bakery: no Sunday) and lead times are per supplier.
- **LPO numbers** for The Bakery start at 557 and move on by one each time an LPO is created.
- **The Bakery LPO** is downloaded as `Title Brew LPO <number>.xlsx`, filled into The Bakery's own Excel format
  (`src/assets/bakery-lpo-template.xlsx`): all 15 items in their order with codes, 0 when not ordered,
  price from the rules, Total = price x qty, VAT 5%, Net = Total + VAT. The contact line is set on
  Items and rules > Suppliers > The Bakery and is stored in the database, not in this public repo.

The starting min/max/pack-size numbers in `src/data/seed.json` were set so the suggestions match the prototype on 5 Nov 2026. Check them on the Items and rules screen.

## How it works: stock, recipes and Loyverse (part 2)

- **Sales**: the Supabase function `loyverse-sync` copies the Loyverse menu and receipts every 5 minutes
  (`supabase/cron.sql`). First runs fill in the last 3 months of receipts (`HISTORY_DAYS = 92` in the function), a few days at a time,
  and resume where they stopped. To bring in more history later: change `HISTORY_DAYS` (e.g. 730), redeploy the function,
  and run `delete from sync_state where key = 'backfill';` in the SQL Editor once.
  Each run is logged and shown as **Sync status** on Items and rules. Times are stored in UTC and shown in Dubai time;
  a shop day runs 4am to 4am. The Loyverse token is the function secret `LOYVERSE_TOKEN`, never in this repo or the browser.
- **Recipes** live in the portal (`recipes`, `modifier_rules`, `ingredients` tables), in g, ml or pieces, with a change history.
  "Set up recipes" copies Loyverse components, converts units and applies Rimma's corrections (`src/lib/catalog.ts`).
  Choices (milk, beans, extra shot, syrup, size, croissant, Classic Coffee) and take-away packaging change what a sale uses
  (`src/lib/usage.ts`).
- **Stock**: `Expected stock = last count + arrived − used by sales − thrown away`, `Difference = counted − expected`, for every
  Shift 1, Shift 2 and weekly count, using receipt, delivery and waste times between the two counts (`src/lib/stock.ts`).
  Pieces alert on any difference; weighed and poured items above 5% (editable per ingredient).
- **Counts from the Google Sheet**: `apps-script/PortalBridge.gs` sends each sheet save to the function `sheet-counts`,
  protected by the secret `BRIDGE_SECRET`. Re-sends never double count.
- **Screens**: Stock, Differences (with Excel export), Recipes (with "Check a sale"), Sales (live), How it works.
- **Setup files**: run `supabase/schema.sql`, then `supabase/stock.sql`, then `supabase/cron.sql` (fill in the two values).
- **Tests**: `npm test` (recipes, stock, orders) and `deno test --allow-env --allow-read --allow-net=jsr.io supabase/functions/_test/` (the two functions).

## Demo mode

Without Supabase settings the portal runs in demo mode with the prototype data. Changes stay in that browser only.

## Secrets

Nothing secret is in this repository. The two Supabase values live in Vercel's Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (the public "anon" key; row-level security in `supabase/schema.sql` controls access)

Never put the `service_role` key anywhere in this project. Staff PINs are Supabase Auth passwords and are only ever typed into Supabase.

## Developer commands

```bash
npm install
npm run dev
npm test
npm run build
```

