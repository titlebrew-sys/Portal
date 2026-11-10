# Next steps from the Claude chat (11 Nov 2026)

Pasted by Arsen. Read this together with NEXT.md at the start of a session. If the two disagree, ask Arsen.

Spec: Claude Doc "Title Brew Portal: Foundation Spec" https://claude.ai/artifact/LpkfB28wE7JZnrbWoNcuEF
Other notes (not in this repo yet): claude/foundation-decisions.md, claude/modifier-rules-draft.md, claude/recipes-agreed.md, claude/takeaway-cups.md, claude/setup-and-deploy-notes.md (read the deploy gotcha before any Code session).
Live system stays the Google Script staff page and Google Sheet until the owner decides to switch. The portal copies Today's Orders from the sheet every 10 minutes, so a rule fixed in the sheet shows in the portal too.

## Done and live
- Steps 1 and 2 (Loyverse connection, recipes agreed), step 3 (retail bags), step 4 (roast detection), step 6 (choices with no rule, sold more than was counted). Missing stock shows in red.
- Portal Orders page copies the sheet's Today's Orders (table sheet_orders_now, sheet-counts function, PortalOrders.gs on a 10 minute timer).
- Supplier by supplier review of order rules finished for all suppliers.
- Rules edits done on 11 Nov: Matcha 500 g, Coconut Truffles 21 pcs, Tonic Water 2 cases, case prices (tonic, orange juice, water, Rama, hibiscus, oat/coconut/almond, New Country Home), Tealand prices per gram with VAT, Free Almond Cookies Fixed order qty 0. All Rules price edits are done. Check Today's Orders still reads correctly.

## Build list (needs code)
1. Deliveries page: show Delayed and Cancelled (the bridge already sends the status). The sheet treats Delayed as still coming, so a delivery that will not arrive must be cancelled.
2. Recipe step 5, cold brew question in the staff app. Needs the live .gs script files with the server functions (spLoad, spSave, spDeliveries), secrets removed. Page.html received 11 Nov (save it in the project with the date in the name). Ask exactly what the question should ask.
3. Milk amounts in recipes (see below).
4. Combined Almond Cookies line.
5. Global Beverages order logic to reach 150 AED.
6. Order total warnings once prices are complete: L's Boutique Bakery under 250 AED (fee 32, avoid one item only), Hotpack under 300 AED (rejected), Tealand single tea (30 AED fee). Classic Fine Foods is manual, no warning.
7. Free coconut case tracker for Emirates Snack Food: when the count reaches 10, add a line asking for 1 free case of coconut milk. Tracker starts at 6 of 10 on 11 Nov.
8. Show the order amount in the SAFCO message (bank transfer).
9. Tealand amounts: nothing to build (she changes 100/150/200/250 g by hand).
10. Shortfall inside the 5 percent tolerance: amber. Red only beyond it. DECIDED.
11. Friday 13 Nov: read the note on the milk row in Today's Orders. "Uses about 5.8 L/day" means weekend learning works.
12. Rounding check: Coconut Truffles must read exactly 21 pcs, not 22.
13. Recipe changes: Cold Brew and Nitro Cold Brew 22 g Ethiopia; Nitro nitrogen 0.33; Matcha Grey per drink; ice teas per serving by dining option; ice tea sweetener 20 ml; + Size on ice tea. Roast detection per origin: 3 kg or more for Brazil and Ethiopia, 0.8 kg for Sidamo and Watermelon.

## Questions waiting
- Hotpack: prices for the 10 items (she will send later).
- Pack sizes (Rules column K): forget it for now. Do not ask.
- Shop numbers: all answered 11 Nov, see below.

## Supplier rules agreed
- Almarai: TARGET rule, no cap on full fat milk. No delivery Sunday, no order Saturday, so Friday covers Sat and Sun. Weekends about 60 percent lower. Friday milk target 16 L.
- The Bakery: TARGET rule, no Sunday delivery, Saturday delivery 10am, Friday orders use Saturday targets.
- L's Boutique Bakery: FIXED. Coconut Truffles counted in sets of 3, order 21 pcs (Count units per order unit 1/3, price =13.387/3). Almond Cookies and Free Almond Cookies are one stock pool: add both counts, one order line, order 24 when combined count is 16 or less.
- Global Beverages: per case VAT incl, tonic 56.7, orange juice 75.6, minimum 150 AED. Tonic 6 cans or fewer orders 2 cases (113.4). If total under 150, add 1 case orange juice when 7 or fewer left (189.0), otherwise a third case of tonic (170.1). Orange juice 4 or fewer orders 1 case plus 2 cases tonic (189.0).
- Khotot Al Emdad: leave as is.
- Tealand: FIXED 250 g, she changes by hand. Delivery fee 30 AED, no minimum. Prices per gram before VAT: Milky Oolong 0.34, Strawberry Kiwi 0.20, Earl Grey 0.218, Peach 0.27, plus 5 percent VAT.
- Classic Fine Foods: case of 24. Free delivery from 300 AED, fee 30 below. Manual website order.
- SAFCO: Rama 1 L bottles, single or 5. Bank transfer.
- Emirates Snack Food: remind them to send the free case. 1 free case per 10 ordered. Resets after the free case arrives. Soy stays TRACK.
- Hotpack: minimums last until the next weekly count plus delivery. Minimum order 300 AED.
- Dupak: minimums last the week. Max per order: 4 oz 500, 6.5 oz 1000, 8 oz 1000, 12 oz paper 2500, 12 oz PET 2000, 16 oz 500. Sheet orders 500, 500, 500, 1000, 1000, 500.
- New Country Home: rules ok. Prices per bottle VAT incl: pomegranate 8, blackberry 9.

## Milk amounts (10 Nov), to build
- Iced drinks with milk: 150 ml. + Size cold drink adds 100 ml (250 total). Matcha Grey keeps 250 ml coconut milk (see conflict note below).
- Cappuccino: 200 ml dine in and takeaway. Cappuccino Large: 313 ml.
- Latte, Spanish Latte, Matcha Latte, Mocha Belgian: 200 ml dine in, 313 ml takeaway.
- RAF and Toffee Coffee: 200 ml, Large 313 ml.
- Flat White and Flat White Large: 200 ml each. Whole 200 ml counts as used, no leftover wastage.
- Code: milk depends on dining option for the four 12oz drinks; size upgrade sets the total instead of adding; alternative milk replaces this amount.

## Cold brew, nitro, syrups, roasts, Matcha Grey, ice tea (11 Nov, decided)
- Cold brew batch: 180 g Ethiopia makes about 2.7 L; serving about 330 ml, so 22 g per serving.
- Nitro: same 330 ml plus nitrogen, 0.33 cartridge per drink.
- Syrup pump: 10 ml.
- Roasts: Ethiopia and Brazil are always 4 kg (rise of 3 kg or more counts as a roast). Sidamo and Watermelon can be 1 kg (rise of 0.8 kg or more). For now only Brazil and Ethiopia are roasted.
- Matcha Grey per drink: 200 ml coconut milk, 2 g Earl Grey, 13 g condensed milk, 3 g matcha.
- Ice teas (Strawberry, Peach): batch 20 g tea + 1.5 L water + 75 ml syrup, about 1.575 L base. Dine in 330 ml: 4.2 g tea + 16 ml syrup. Takeaway 280 ml: 3.6 g tea + 13 ml syrup. Sweetener is a free option, adds 20 ml same syrup. + Size adds about 100 ml: 1.3 g tea, 5 ml base syrup, plus 10 ml syrup (assumption).

## Earlier items still pending
Count screen design, Bakery LPO exact xlsx, Safari sales period bug, receiving flexibility (add, cancel, substitute), history pages.
