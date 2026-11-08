# To do next (agreed with Arsen, 8 Nov 2026)

1. **Order rules: one source.** The Google Sheet's Rules tab (when to order what, per supplier)
   does not match the Portal's own copy of the rules. The Portal should read the suppliers, rules
   and items from the Google Sheet, so the Orders page suggests the same as Today's Orders.

2. **Recipes: make them accurate.** So the Portal can compare sales vs what was counted vs what
   was expected, and the Differences page can be trusted.
   Also decide how differences should work without assuming count times: the sheet does not say
   when Shift 1 was counted, and the Portal assumes 4pm (this gave a wrong -1 for Caesar wrap on
   7 Nov; a closing-to-closing version was tried and undone, to be decided together).

Done 8 Nov: every Save in the staff app (staff or manager) sends the counts to the Portal straight
away (spSendToPortal in PortalBridge.gs, called from Page.html after "Saved").
