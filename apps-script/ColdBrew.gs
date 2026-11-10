/**
 * Title Brew staff app: the cold brew question at the Bar count (11 Nov 2026).
 * Add this as a NEW script file called "ColdBrew". It only ADDS functions, it changes nothing by itself.
 * It is used by 3 small lines you add in StaffPage.gs (see COLDBREW-STEPS.md).
 *
 * The answer is saved in a new tab "Cold Brew Log" (made the first time someone saves). One row per day and shift.
 * Nothing in the Bar tab changes. No secrets in this file.
 */

const SP_COLDBREW_ITEM = 'Ethiopia beans';   // the question shows under this Bar item
const SP_COLDBREW_SHEET = 'Cold Brew Log';
const SP_COLDBREW_GRAMS = 180;               // beans in one batch

function spColdBrewSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SP_COLDBREW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SP_COLDBREW_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([['When', 'Business day', 'Shift', 'Staff', 'Answer', 'Beans used (g)']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#3E2723');
    sh.setFrozenRows(1);
    sh.getRange('B2:C2000').setNumberFormat('@');   // keep the day and shift as text
    sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 110);
  }
  return sh;
}

// Today's answer for this shift: 'Yes', 'Not made' or '' (not answered yet)
function spColdBrewGet(day, shift) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SP_COLDBREW_SHEET);
  if (!sh || sh.getLastRow() < 2) return '';
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === day && rows[i][2] === String(shift)) {
      return rows[i][4] === 'Yes' ? 'Yes' : rows[i][4] === 'Not made' ? 'Not made' : '';
    }
  }
  return '';
}

// Returns an error text, or '' when fine. The question only applies at the Bar, when the Ethiopia row is on the screen.
function spColdBrewCheck(area, where, answer) {
  if (area !== 'Bar' || !where[SP_COLDBREW_ITEM]) return '';
  const a = String(answer || '');
  return (a === 'Yes' || a === 'Not made') ? '' : 'Answer the cold brew question under ' + SP_COLDBREW_ITEM + '.';
}

// Saves the answer (replaces today's row for this shift, so fixing an answer works)
function spColdBrewSave(area, where, shift, name, answer) {
  if (area !== 'Bar' || !where[SP_COLDBREW_ITEM]) return;
  const a = String(answer || '');
  if (a !== 'Yes' && a !== 'Not made') return;
  const sh = spColdBrewSheet_();
  const day = spTodayKey();
  const sft = String(shift);
  const row = [new Date(), day, sft, name, a, a === 'Yes' ? SP_COLDBREW_GRAMS : 0];
  let target = 0;
  if (sh.getLastRow() >= 2) {
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] === day && rows[i][2] === sft) { target = i + 2; break; }
    }
  }
  if (!target) target = sh.getLastRow() + 1;
  sh.getRange(target, 2, 1, 2).setNumberFormat('@');
  sh.getRange(target, 1, 1, 6).setValues([row]);
  sh.getRange(target, 1).setNumberFormat('ddd d mmm, h:mm am/pm');
}
