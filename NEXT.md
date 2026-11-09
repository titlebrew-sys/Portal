# To do next (agreed with Arsen, 8 Nov 2026)

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
  - Retail bags: options offered (A separate "(one bag)" items in Loyverse, recommended; B variant;
    C guess by quantity; modifier). Waiting for Arsen's choice.
Recipes job ideas: a list of Loyverse choices (modifiers) the Portal has no rule for, so names like
"Ethiopia Sidamo (Filter)" (9 Nov: fell back to Colombia filter beans) are caught early; clearer text
when expected stock is below zero ("sold more than was counted").

**Built 9 Nov (waiting for Arsen to paste and test):** LPO fix, own email for staff (Download LPO +
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
