import { useApp } from '../ctx';
import { Head, MobileWho } from '../components';
import { SyncLine } from './stockParts';

export function HowItWorks() {
  const { data } = useApp();
  return (
    <>
      <MobileWho />
      <Head eyebrow="Help" title="How it works" sub="How the portal works out stock, in plain words." />
      <div className="panel">
        <h2>Is everything up to date?</h2>
        <SyncLine runs={data.book.syncRuns} />
      </div>
      <div className="panel how">
        <h2>1. Sales come in from Loyverse</h2>
        <p>Every 5 minutes the portal copies new receipts from Loyverse: what was sold, the choices (milk, beans, syrup), and whether it was take-away. Refunds give the stock back. Cancelled receipts are left out.</p>
        <p>Times are Dubai time. A shop day runs from 4am to 4am, so a sale at 1am counts for the day before.</p>
      </div>
      <div className="panel how">
        <h2>2. Recipes say what each sale uses</h2>
        <p>Every menu item has a recipe in grams, millilitres or pieces, for example "Latte: 22 g coffee, 250 ml milk". The portal's recipes decide stock use, not Loyverse. You can change them on the Recipes page, and every change is kept with who made it and when.</p>
        <p>Choices change the recipe:</p>
        <ul>
          <li><b>Milk choice</b> (oat, almond, soy, coconut, low fat, lactose free) replaces the drink's milk with the same amount. No choice means full fat milk. On a drink without milk it adds a 50 ml splash.</li>
          <li><b>Bean choice</b> decides which beans the coffee comes from. No choice means Brazil. Each bean is tracked on its own.</li>
          <li><b>Extra shot</b> adds 22 g of that bean (matcha: 3 g). <b>Syrup</b> adds 30 ml (3 pumps). An extra pump with no syrup named is shared across the syrups by how often each is chosen.</li>
          <li><b>Large</b> adds 50 ml milk and uses a bigger take-away cup.</li>
          <li><b>Take-away</b> adds the cup, lid and straw for that drink. "+ Size cold drink" swaps the 12oz clear cup for a 16oz one.</li>
        </ul>
        <p>To see exactly what one sale used, open Recipes, then Check a sale.</p>
      </div>
      <div className="panel how">
        <h2>3. Expected stock and differences</h2>
        <p className="formula">Expected stock = last count + arrived − used by sales − thrown away</p>
        <p className="formula">Difference = counted − expected</p>
        <p>Every count (Shift 1, Shift 2, or the weekly count) is compared with the count before it. "Arrived" is what was confirmed on the Receive page. "Used by sales" is every receipt between the two count times. "Thrown away" is the waste log.</p>
        <p>Tap any number on the Stock or Differences pages to see how it was worked out, down to each receipt.</p>
      </div>
      <div className="panel how">
        <h2>4. When is a difference a problem?</h2>
        <p>Things counted in pieces (sandwiches, croissants, cups): any difference shows an alert. Things weighed or poured (beans, milk, syrups): a difference above 5% shows an alert. The owner can change the limit for each ingredient on Items and rules, Ingredients.</p>
        <p>Alerts appear on Today and on the Differences page, for staff and owner.</p>
      </div>
      <div className="panel how">
        <h2>5. Where counts come from</h2>
        <p>Staff still count in the Google Sheet staff page. Each save there is also sent to the portal, so differences work from day one. If an item name in the sheet is spelled differently, it shows under "Google Sheet counts" above, and the owner links it on Items and rules, Ingredients.</p>
      </div>
    </>
  );
}
