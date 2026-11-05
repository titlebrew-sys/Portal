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

The starting min/max/pack-size numbers in `src/data/seed.json` were set so the suggestions match the prototype on 5 Nov 2026. Check them on the Items and rules screen.

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

