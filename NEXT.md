# To do next (agreed with Arsen, 8 Nov 2026)

**Built 10 Nov (needs 4 steps from Arsen, see chat): the Portal Orders page shows the sheet's Today's Orders (option A).**
New: supabase/sheet-orders.sql (run once), sheet-counts function (redeploy), apps-script/PortalOrders.gs (new file, run
portalBridgeSetupOrdersTrigger once). The Portal no longer works out orders itself; Today and the Orders badge use the same copy.

**REMIND ARSEN (he asked):** open questions on order rules,
asked 8 Nov after reading the sheet's Rules, Suppliers, Bar, Kitchen, Weekly and Today's Orders tabs.
1. Portal Orders page: mirror the sheet's Today's Orders (recommended, sheet = one place for rules),
   or calculate its own orders from the sheet's Rules?
2. Coffee beans (Brazil, Ethiopia, Colombia, Sidamo, Watermelon), nitro cartridges, chocolate powder,
   toffee powder, chopped hazelnuts: not in Rules. Who supplies them? Low-stock warning level?
3. Matcha: bag is 500 g (Rules) or 250 g (Bar tab note)?
4. Rules column K (count units per order unit) is 1 for: tonic (cans/case), orange juice (btls/case),
   matcha (g/bag), tortilla chips (packs/carton, note says 4), Hotpack items (per carton/set),
   Dupak cups (count in sleeves, order in pcs). The Portal needs these to know how much arrived.
   ANSWERS 9 Nov: 2) don't worry about suppliers of untracked items. 3) matcha is ordered as one
   500 g bag, delivered as 2 x 250 g. 4) packs: tonic 24 cans/case (330 ml each), OJ 12 x 1 L,
   matcha 500 g/bag, tortilla 4 packs/carton, carriers 6 sleeves/carton (50 each, 300), napkins 20
   packets/carton, large box 120, small box 150, paper bags 250/carton, straws 40 packets/carton
   (250 straws each), maxi roll 6 rolls/set, cups 25 per sleeve except 12oz PET 50 and 12oz paper
   20. Arsen to type these into Rules column K. Open: cutlery, paper cookies bag, Dupak order unit
   (sleeves vs pcs). 5) no rule change: desserts held to order together (free delivery), soy milk
   cheaper from the shop (suggested: set soy to TRACK; idea: "below free delivery" note).
   1) explained again in simpler words; waiting for A (Portal shows the sheet's orders) or B.
   ANSWERS 9 Nov (later): 1) A: the Portal Orders page shows the sheet's Today's Orders.
   Cutlery: 500 sets per carton. Square Bottom Brown Paper Bag 500pcs: 500 per carton. Paper Cookies
   Bag 15x15 1000pcs (white): 1000 per carton. Dupak cups: keep ordering in pcs (count in sleeves, so
   the Portal converts: 25 per sleeve, 12oz PET 50, 12oz paper 20). Soy milk TRACK: Arsen did not
   understand, explained in simpler words, waiting for his answer.
5. Overrides on 8 Nov (frozen chocolate croissant: rule orders 20 at 5 or less; soy milk: top up to
   12 at 2 or less): change the rules?
Ideas offered: warn when an order is under free delivery / minimum (L's Boutique 250 AED, Global
Beverages 150 AED) and suggest items near reorder level; note when close to 10 cases of coconut milk
(1 free). Small fix: Suppliers tab, New Country Home cutoff typo "4p m".
After rules: recipes, by asking Arsen questions item by item (Arsen: later).
**Recipes: Arsen's answers so far (9 Nov, do not build until he says so):**
- Espresso-based coffee: 18 g (was 22 g). Not filter coffee. List of drinks sent to Arsen to confirm.
- Filter (V60, Ice V60, AeroPress): 20 g; default beans Ethiopia (not Colombia) unless chosen.
- Extra Shot modifier: 18 g.
- Default beans: Brazil, but Americano, Ice Americano and Espresso default to Ethiopia (alternative
  Brazil via the modifier).
- Cold brew is made in batches: 180 g Ethiopia makes about 2.7 L; one serving is about 330 ml
  (so about 22 g a serving). Nitro cold brew: the same 330 ml cold brew plus nitrogen; one cartridge
  makes 1 L of nitro cold brew (about 0.33 cartridge a serving).
- Retail coffee bags: the menu sells 250 g bags (from the shop shelf). For 1 kg or more, the customer
  is charged 4 x 250 g but gets one bigger bag filled from the counted bean stock, not from the shelf.
- Milk: regular milk drinks 214 ml; large (takeaway large, 12oz cup) 322 ml, like a takeaway latte.
  Dine-in cups have set sizes. Questions open (see chat 9 Nov).
- 9 Nov answers 2:
  - Cold brew: option B. The Bar count asks under Ethiopia beans, at BOTH shifts, whether cold brew
    was made, naming the exact time span (since the last count until now), so the beans come off when
    brewed. 330 ml for dine-in and take-away.
  - Retail bags: single retail bags (Brazil 250g, Ethiopia 250g only) come from the shelf. One zipper
    bag of 500 g / 750 g / 1 kg is always filled from the counted shop stock. Mixed origins are always
    separate retail bags. Loyverse can't tell the two apart yet (both sold as 250 g items): needs a way.
  - Roasting: Arsen roasts green beans; from each roast he packs 250 g retail bags for the shelf, and
    the rest goes into the counted shop stock.
  - Milk: all dine-in cups 214 ml. Take-away: Cappuccino Large and every Latte (all kinds, incl.
    Latte Macchiato) 322 ml; other take-away milk drinks 214 ml. Cortado, Macchiato, Piccolo 214 ml.
    Iced milk drinks 214 ml; with "+ Size cold drink" (16oz instead of 12oz clear cup) 300 ml milk
    and one more double espresso. No large for dine-in.
  - Sizes: Cappucino Large = 8oz to 12oz; Flat White Large = 6.5oz to 8oz (modifiers);
    "+ Size cold drink" is a menu item.
  - Americano = Long Black, Ice Americano = Ice Long Black in Loyverse.
- 9 Nov answers 3:
  - Cold brew question in the APP: "Yes made, 180 g used" or "Not made". No counting of cold brew
    litres (Arsen: keep it simple).
  - Roast: no staff entry. Idea offered: the Portal treats an increase in a bean count as "roast
    added (assumed)", above a threshold. Asked: typical roast amount into stock, how often.
  - "+ Size cold drink": Ice Matcha +3 g matcha and 312 ml milk; Ice Tea one more serving and
    2 more pumps of sweetener; iced coffee drinks 300 ml milk + one more double espresso.
  - Flat White Large take-away: 214 ml milk.
  - Spanish Latte condensed milk: dine-in 25 g, take-away 35 g.
  - Retail bags (decided): 4 or more 250 g bags of the same origin on one receipt (1 kg or more)
    come from the counted shop stock of that origin; fewer come from the shelf (no stock use).
  - Roast (decided): a bean count that goes up by more than 4 kg since the last count is taken as
    a new roast batch added to stock (about once a week). Smaller increases stay differences.
Recipes job ideas: a list of Loyverse choices (modifiers) the Portal has no rule for, so names like
"Ethiopia Sidamo (Filter)" (9 Nov: fell back to Colombia filter beans) are caught early; clearer text
when expected stock is below zero ("sold more than was counted").

**Built 9 Nov, pasted, setupStillComing run and deployed by Arsen 9 Nov (now in live use):** LPO fix, own email for staff (Download LPO +
Open email, manager keeps the Gmail draft), Delayed / Delivery cancelled in Deliveries. Also built: delayed items lower
the sheet's suggestion (column W + setupStillComing). Still to do: the Portal Deliveries page
could show Delayed / Cancelled (the bridge now sends each item's status).

**Bug 9 Nov: LPO number does not change in the LPO file or in its file name (APP, The Bakery).**
Cause found 9 Nov: Rules C2 = 'Today''s Orders'!B33, but the LPO Number row moved (row 40 on 8 Nov).
draftBakeryEmail reads Rules C2 for the file name and LPO. Fix given: Rules C2 =
INDEX('Today''s Orders'!B:B, MATCH("LPO Number*", 'Today''s Orders'!A:A, 0)). Waiting for Arsen to
confirm. Arsen sees the LPO box in the app, but the Orders.gs he pasted has no function for it:
need the live Page.html to see which server function the box calls.

**Requested 9 Nov: order by email from the staff member's email (APP, Place Order for Tomorrow).**
Today the Gmail draft (Almarai, The Bakery) goes to the sheet owner's Gmail, because the web app runs
as the owner. Asked Arsen: A) draft/email in the staff member's own Gmail (needs each staff to sign
in with Google), B) send from Title Brew with the staff member in copy, C) send directly from Title
Brew with the staff name, D) other. Arsen chose A, also for WhatsApp (her own WhatsApp: already so).
Proposed: "Open email" = mailto link on the phone (her own mail app, To/Subject/body filled; no need to
store her email). The Bakery: "Download LPO" + "Open email", she attaches the file. Arsen OK (9 Nov),
but the admin keeps "Save as draft in Gmail" (draft in the Title Brew Gmail with the LPO attached).

**Requested 9 Nov: Delayed / Cancelled buttons in Deliveries (APP, Shift 2, per supplier).**
When an ordered delivery did not come: "Delayed" (expected next day, the usual case) or
"Delivery cancelled" (e.g. vehicle broke down, stop expecting it). Things to settle and build:
- Delayed: the supplier's items move to tomorrow's Deliveries list to confirm; the Portal must not
  count them as arrived today (today the sheet's orders are taken as delivered next morning).
- Cancelled: the Portal removes the expected arrival; tomorrow's order should suggest those items again.
- Arsen 9 Nov: Delayed must still allow confirming the same day (last-minute delivery before
  closing). Delayed = not here yet, still expected; unconfirmed at closing moves to tomorrow.
- Arsen 9 Nov: any staff may press them; per item (part came, part delayed); tomorrow's suggested
  order counts delayed items as already coming (needs Code.gs, where Today's Orders is built).
Touches: live Deliveries.gs and Page.html (copy live first), PortalBridge.gs payload, sheet-counts
function, Portal Deliveries page.

**Recipes: Arsen said GO (9 Nov). Step 1 built, waiting for Arsen to test:** coffee 18 g (espresso) and 20 g
(V60, Ice V60, AeroPress), Ethiopia default for Espresso, Long Black, Ice Long Black, filter; Extra Shot (Ethiopia/Brazil)
18 g; Colombia (Filter) removed (now Ethiopia Sidamo (Filter) = Sidamo beans); nitro 0.33 cartridge. Live data changes only when the owner presses
"Update now" on the Portal Recipes page (src/lib/recipeUpdate.ts). Step 2 built (milk 214 ml, take-away Latte family and Cappuccino Large 322 ml, Flat White Large 214,
+ Size cold drink via the Matcha or Coffee choice, Spanish Latte condensed 25/35 g; same Update now button;
Matcha Grey and Babyccino keep their own milk). Step 2b built: Matcha Grey 200/2/13/3, shaken ice tea
from the batch (dine-in 330 ml, take-away 280 ml, sweetener 20 ml). Still to build, in order: 3) retail bags
(4+ same origin on a receipt come from counted stock), 4) roast detection (+4 kg between counts),
5) cold brew 180 g question in the APP (needs the LIVE Page.html and Bar count code from Arsen),
6) list of choices with no rule (exists), "sold more than was counted" text.

**REMIND ARSEN: CHECK IN THE SHOP (he said "about" / "approximately", 9 Nov).** Numbers the recipes use but he is not sure of:
- Cold brew: 180 g Ethiopia makes about 2.7 L; a serving is about 330 ml (so about 22 g).
- Nitro: one cartridge makes about 1 L (so 0.33 a serving).
- Matcha Grey: base is 1 L coconut milk + 10 g earl grey + 65 g condensed milk; we ASSUME it makes about 1 L, so a
  200 ml serving = 200 ml coconut milk, 2 g tea, 13 g condensed milk (+ 3 g matcha, exact).
- Ice tea batch: 20 g tea + 1.5 L water + 7.5 pumps syrup; we ASSUME 1 pump = 10 ml (75 ml syrup) and the batch = 1.5 L.
  A serving is about 330 ml dine-in and about 280 ml take-away; sweetener = 2 pumps (20 ml, if 1 pump = 10 ml).
- Ice tea "+ Size cold drink": about 100 ml more of the same tea (1.33 g tea, 5 ml syrup). Open: any extra sweetener pumps?
- Roast: "about once a week", typical roast size not yet given.
- Syrup pump = 10 ml (used in Extra Pump rules too): never confirmed.

**Update from the Claude chat, 10 Nov: Kitchen "Thrown away" column (APP).** Live Code.gs, StaffPage.gs, Page.html changed
(Orders.gs, Deliveries.gs, PortalBridge.gs NOT changed); new one-time upgradeThrownAway() in Code.gs. New Kitchen column M
"Thrown away" (LAYOUT.Kitchen.s2t = 13). At Shift 2 Kitchen G (Old), I (New), L (Frozen) now mean what is LEFT on the shelf after
clearing; thrown today goes in M, reason stays in H, note in J. Old baked croissants must be 0 at Shift 2 (entered in M).
Choco and matcha balls: G unused at Shift 2; I = Available left, M = thrown.
**Built 10 Nov, waiting for Arsen:** apps-script/PortalBridge.gs (repo copy, built on the repo copy, NOT checked against the live file:
Arsen to paste it over the live PortalBridge.gs, or send the live one first): cleared qty = column M (only if reason in H is
valid and M > 0); Shift 2 old/new/frozen as they are; only for business dates from 10 Nov 2026 (PORTAL_BRIDGE_THROWN_FROM);
earlier days keep the old rule; History (portalBridgeHistory_) keeps its Cleared text format and does not set old = 0 from 10 Nov.
Then: Deploy > Manage deployments > pencil > New version > Deploy. Untested in the real sheet.

**Update from the Claude chat, 10 Nov: business day 4am to 4am in the sheet.** Live Code.gs and StaffPage.gs changed (Page.html, Orders.gs,
Deliveries.gs, PortalBridge.gs not changed live): Bar!C2 and Kitchen!C2 = TODAY()-IF(HOUR(NOW())<4,1,0) (one-time setupBusinessDay()),
spTodayKey() = business day, clearCount() uses the calendar date.
**Built 10 Nov, waiting for Arsen to paste (repo copies, not checked against live):** PortalBridge.gs (new portalBridgeBusinessKey_();
orders are sent from 4pm until 4am, hour >= 16 or < 4) and PortalOrders.gs (the "saturday" flag uses the business day). Paste both,
then Deploy > Manage deployments > pencil > New version > Deploy. The earlier Kitchen "Thrown away" change is in the same PortalBridge.gs.

1. **Order rules: one source.** The Google Sheet's Rules tab (when to order what, per supplier)
   does not match the Portal's own copy of the rules. The Portal should read the suppliers, rules
   and items from the Google Sheet, so the Orders page suggests the same as Today's Orders.

2. **Recipes: make them accurate.** So the Portal can compare sales vs what was counted vs what
   was expected, and the Differences page can be trusted.
   Also decide how differences should work without assuming count times: the sheet does not say
   when Shift 1 was counted, and the Portal assumes 4pm (this gave a wrong -1 for Caesar wrap on
   7 Nov; a closing-to-closing version was tried and undone, to be decided together).

Done 8 Nov (Claude chat): "Orders for tomorrow" screen in the APP, built from the Today's Orders tab,
for Staff with column D "Can Send Orders" = Y. Orders are logged in the "Orders Log" tab.
Idea for later: the Portal could read the Orders Log to show what was really sent, by whom and when.

Done 8 Nov: every Save in the staff app (staff or manager) sends the counts to the Portal straight
away (spSendToPortal in PortalBridge.gs, called from Page.html after "Saved").

## Cold brew question (11 Nov 2026)
- Staff app: StaffPage.gs, Page.html, ColdBrew.gs (live 11 Nov copies plus the question). Answers go to the "Cold Brew Log" tab.
- Portal side built: PortalBridge.gs sends `cold_brew`, edge function sheet-counts saves to table `cold_brew_log` (supabase/cold-brew.sql),
  `coldBrewUsage` in src/lib/usage.ts adds 180 g Ethiopia per "Yes". Arsen decided: no answer = Not made = 0 g.
- Cold Brew and Nitro Cold Brew drinks now use NO beans (the batch covers it). Arsen must press "Update now" on Recipes to apply.
- To switch on: run supabase/cold-brew.sql, redeploy sheet-counts, paste PortalBridge.gs, press Update now.

## 11 Nov 2026: roasts, amber, deliveries page
- Roasts: owner enters the real weight on the Stock page, Roasts panel (table `roasts`, supabase/roasts.sql). A real roast replaces the assumed one;
  the assumed roast stays only as an amber prompt. Per origin limit: Brazil and Ethiopia 3 kg or more, Sidamo and Watermelon 0.8 kg or more (`roastRiseG`).
- Amber: a shortfall inside the tolerance is amber, red only beyond it (`diffClass` in src/lib/stock.ts).
- Deliveries page shows Delayed and Cancelled (edge function sheet-counts now keeps the item status; redeploy it).
- To switch on: run supabase/roasts.sql, redeploy sheet-counts, then enter Brazil 14,200 g (10 Nov) and the real Ethiopia roast on Stock > Roasts.

## 11 Nov 2026: lighter portal
- Removed the Count, Orders and Deliveries pages (and the Receive view) from the Portal. The Google Sheet and staff app do these jobs.
  Data still flows in (counts, deliveries, orders mirror) because Stock and Differences use it. Old pages are in git history if ever needed.
