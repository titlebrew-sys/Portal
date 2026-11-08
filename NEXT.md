# To do next (agreed with Arsen, 8 Nov 2026)

**START HERE (Arsen asked to be reminded first, whatever he types):** open questions on order rules,
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
After rules: recipes, by asking Arsen questions item by item.

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
