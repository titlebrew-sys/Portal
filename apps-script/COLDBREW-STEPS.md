# Cold brew question: 3 steps (11 Nov 2026)

Do these in the Google Apps Script project (Sheet > Extensions > Apps Script). Use Ctrl+F > "Replace" mode is NOT needed:
click in the file, press Ctrl+F, paste the "Find" text to jump to it, then make the change shown.

## Step 1. New file ColdBrew
Click + next to Files > Script > name it `ColdBrew`. Delete the starter text, paste the whole of `apps-script/ColdBrew.gs`.

## Step 2. StaffPage.gs (3 small changes)

**2a. Find:** `name: item, kind: kind, unit: unit,`
**Replace with:** `name: item, kind: kind, cbAsk: area === 'Bar' && item === SP_COLDBREW_ITEM, cb: (area === 'Bar' && item === SP_COLDBREW_ITEM) ? spColdBrewGet(spTodayKey(), shift) : '', unit: unit,`

**2b. Find:** `function spSave(token, area, shift, changes, answers) {`
**Replace with:** `function spSave(token, area, shift, changes, answers, coldBrew) {`

**2c. Find:** `    // Check everything first, so a bad value saves nothing`
**Add these 2 lines ABOVE it:**
```
    const cbErr = spColdBrewCheck(area, where, coldBrew);
    if (cbErr) return { ok: false, msg: cbErr };
```

**2d. Find:** `    writes.forEach(function (w) { sh.getRange(w.row, w.col).setValue(w.value); });`
**Add this 1 line ABOVE it:**
```
    spColdBrewSave(area, where, shift, name, coldBrew);
```

## Step 3. Page.html (6 small changes)

**3a. Find:** `</style>`  (only one)
**Add ABOVE it:**
```
  .cb { flex: 1 1 100%; border-top: 1px dashed var(--line); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .cb-q { font-size: 14px; font-weight: 700; color: var(--ink); }
  .cb-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cb.missing { border: 2px solid #B42318; background: #FEF3F2; border-radius: 10px; padding: 8px; }
```

**3b. Find:** `if (it.showExp) { S.loaded[k(it.name, 'expOld')] = it.expOld; S.loaded[k(it.name, 'expNew')] = it.expNew; }`
**Add right after it (same line is fine):**
```
 if (it.cbAsk) S.loaded[k(it.name, 'cb')] = it.cb || '';
```

**3c. Find:** `          ctl.appendChild(el('span', 'unit', it.unit));`
Two lines below it you will see `card.appendChild(ctl);`. **Add this line right after `card.appendChild(ctl);`:**
```
          if (it.cbAsk) card.appendChild(cbBox(it, d.locked));
```

**3d. Find:** `  // Kitchen sections open one at a time`
**Add ABOVE it:**
```
  // Cold brew question (Bar, under Ethiopia beans)
  var cbEls = {};
  function cbBox(it, locked) {
    var box = el('div', 'cb'); cbEls[it.name] = box;
    box.appendChild(el('div', 'cb-q', 'Cold brew made? (180 g ' + it.name.replace(/ beans$/i, '') + ')'));
    var row = el('div', 'cb-btns'), btns = [];
    [['Yes', 'Yes, 180 g used'], ['Not made', 'Not made']].forEach(function (o) {
      var b = el('button', 'h-opt' + (S.values[k(it.name, 'cb')] === o[0] ? ' on' : ''), o[1]); b.type = 'button'; b.disabled = locked;
      b.onclick = function () {
        setVal(it.name, 'cb', o[0]); box.classList.remove('missing');
        btns.forEach(function (x) { x.classList.toggle('on', x === b); });
      };
      btns.push(b); row.appendChild(b);
    });
    box.appendChild(row);
    return box;
  }
  function cbItem() {
    var found = null;
    if (S.data) S.data.sections.forEach(function (sec) { sec.items.forEach(function (it) { if (it.cbAsk && !found) found = it; }); });
    return found;
  }
  function cbValue() { var it = cbItem(); return it ? (S.values[k(it.name, 'cb')] || '') : ''; }
  function cbCheck() {
    var it = cbItem();
    if (!it || cbValue()) return true;
    var box = cbEls[it.name]; if (box) box.classList.add('missing');
    $('saveMsg').className = 'msg err'; $('saveMsg').textContent = 'Answer the cold brew question under ' + it.name + '.';
    if (box) reveal(it.sec, box);
    return false;
  }

```

**3e. Find:** `    var badThrown = false;`
**Add ABOVE it:**
```
    if (!cbCheck()) return;
```

**3f. Find:** `call('spSave', [S.token, S.area, S.shift, list, ansList], function (res) {`
**Replace with:** `call('spSave', [S.token, S.area, S.shift, list, ansList, cbValue()], function (res) {`

## Step 4. Go live
Deploy > Manage deployments > pencil > New version > Deploy.

## Test
Open the staff app > Bar. Under Ethiopia beans you see "Cold brew made?" with two buttons. Try Save without answering: it must stop and ask.
Answer, save, and check the new tab "Cold Brew Log": one row for today and the shift.
(On Saturday and Sunday at Shift 1 the Ethiopia row is hidden, so the question is not asked then.)
