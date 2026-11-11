# Title Brew: rules for Claude

Read this at the start of every chat. Also read `NEXT.md` for pending work.

## Who
- **Arsen**: main admin and manager of Title Brew, a café in Dubai. Not technical.
- **Rhobel**: trusted staff who places orders. NOT a manager. Never give Rhobel manager rights (no editing after the deadlines).

## How to talk to Arsen
- Plain language, short answers, click-by-click steps.
- No em dashes.
- Always say exactly which files changed.
- Keep things simple. Don't add complexity he didn't ask for.
- If he says "undo", undo it fully.
- Don't build anything on hold (recipes, the order rules) until he says go.

## Security (never break these)
- The repo is public. Never put keys, passwords, tokens or staff PINs in the code.
- Never put the Loyverse token, service keys or PINs in the repo or the browser.
- Never write Rhobel's PIN anywhere.
- Never share or ask for the Staff tab (it has the PINs).

## Git
- Commit as titlebrew-sys:
  - `git config user.name "titlebrew-sys"`
  - `git config user.email "352939538+titlebrew-sys@users.noreply.github.com"`
- Never rewrite history.
- Don't open a pull request unless Arsen asks.

## The two systems
- **APP**: the Google Apps Script staff website inside the Google Sheet "Title Brew TEST".
  - The live Apps Script project is the master copy. Always ask Arsen for the live file before changing it.
  - The files in `apps-script/` are copies. See `apps-script/README.md` for which ones match live.
  - After he pastes a file: Deploy > Manage deployments > pencil > New version > Deploy.
  - `google.script.run` drops null values. Send 0 or -1 instead.
- **Portal**: https://portal-wine-delta-16.vercel.app (this repo, Vite + React, Supabase, Vercel).
  - MONITORING ONLY (Arsen, 11 Nov). Nobody orders on the Portal. All ordering is in the APP and the sheet. Don't build ordering features in the Portal.
  - Reads Loyverse live. Business day runs 4am to 4am Dubai time.
  - Live recipes are data in Supabase, not in the code. `src/lib/catalog.ts` only sets defaults.
  - Suppliers, rules and items come from the Google Sheet, not the Portal.
  - Run `npx vitest run` before committing Portal changes.
