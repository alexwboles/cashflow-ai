#!/bin/bash
# CashFlow smoke tests — file presence, syntax, core logic sanity.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# 1. expected files exist
for f in index.html css/style.css js/data.js js/forecast.js js/app.js data/sample.csv README.md test/e2e.sh; do
  [ -f "$f" ] && ok "file exists: $f" || bad "missing file: $f"
done

# 2. JS syntax valid
for f in js/data.js js/forecast.js js/app.js; do
  node --check "$f" 2>/dev/null && ok "syntax ok: $f" || bad "syntax error: $f"
done

# 3. index.html wires up the scripts
grep -q 'js/data.js' index.html && grep -q 'js/forecast.js' index.html && grep -q 'js/app.js' index.html \
  && ok "index.html loads data.js, forecast.js, app.js" || bad "index.html missing script tags"

# 4. sample CSV has header + 16 rows
ROWS=$(($(wc -l < data/sample.csv) - 1))
[ "$ROWS" -eq 16 ] && ok "sample CSV has 16 data rows" || bad "sample CSV rows: $ROWS"

# 5+. logic checks via node
node << 'NODEEOF'
const CF = require('/home/hatch/workspace/cashflow-ai/js/forecast.js');
const D = require('/home/hatch/workspace/cashflow-ai/js/data.js');
const fs = require('fs');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

// parseAmount
const amts = [['$1,234.56', 1234.56], ['(45.00)', -45], ['-12.5', -12.5], ['3200', 3200], ['abc', null], ['', null]];
amts.every(([s, w]) => CF.parseAmount(s) === w) ? ok('parseAmount: $, commas, parens, negatives, rejects junk') : bad('parseAmount mismatch');

// parseDate
(CF.parseDate('2026-10-02') instanceof Date && CF.parseDate('10/02/2026') instanceof Date &&
 CF.parseDate('2026-13-99') === null && CF.parseDate('nope') === null)
  ? ok('parseDate: ISO + US formats, rejects invalid') : bad('parseDate broken');

// money formatting
(CF.money(1234.5) === '$1,234.50' && CF.money(-5) === '-$5.00' && CF.money(0) === '$0.00')
  ? ok('money formats $1,234.50 / -$5.00 / $0.00') : bad('money: ' + CF.money(1234.5));

// sample data shapes
(D.SAMPLE_INVOICES.length === 8 && D.SAMPLE_BILLS.length === 8 && D.SAMPLE_START_BALANCE === 4000)
  ? ok('sample data: 8 invoices, 8 bills, $4000 start') : bad('sample data shape wrong');

// CSV import of sample
const text = fs.readFileSync('/home/hatch/workspace/cashflow-ai/data/sample.csv', 'utf8');
const res = CF.rowsToItems(CF.parseCSV(text));
(res.items.length === 16 && res.errors.length === 0)
  ? ok('sample.csv -> 16 items, 0 errors') : bad('csv: ' + res.items.length + ' items, ' + res.errors.length + ' errors');
(res.items.filter(i => i.kind === 'in').length === 8 && res.items.filter(i => i.kind === 'out').length === 8)
  ? ok('csv: 8 in / 8 out') : bad('csv kind split wrong');

// forecast structure
const fc = CF.forecast(res.items, 4000, 13, {});
(fc.length === 13 && fc.every((w, i) => w.index === i))
  ? ok('forecast returns 13 indexed weeks') : bad('forecast length ' + fc.length);
// balances chain: each week's balance = prev + net
let chained = true, prev = 4000;
fc.forEach(w => { if (Math.abs(w.balance - (prev + w.net)) > 0.01) chained = false; prev = w.balance; });
chained ? ok('weekly balances chain correctly') : bad('balance chaining broken');

// weekStartOf is a Monday
CF.weekStartOf(new Date(2026, 8, 30)).getDay() === 1 ? ok('weekStartOf returns Monday') : bad('weekStartOf not Monday');

// sample data produces at least one shortfall (the demo scenario)
const sf = CF.shortfalls(fc);
sf.critical.length >= 1 ? ok('sample forecast has ' + sf.critical.length + ' shortfall week(s) — alert path works') : bad('no shortfall in sample data');

// storage round-trip
CF.storageSet('tkey', [1, 2]);
JSON.stringify(CF.storageGet('tkey', null)) === '[1,2]' ? ok('storage round-trip works') : bad('storage broken');

console.log('NODE_PASS=' + pass + ' NODE_FAIL=' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
[ $? -eq 0 ] && ok "node logic checks green" || bad "node logic checks had failures"

# new features: recurring expansion, forecast CSV, edit/print UI hooks (node)
node << 'NODEEOF'
const CF = require('/home/hatch/workspace/cashflow-ai/js/forecast.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };
function isoPlus(days) { return CF.toISODate(CF.addDays(new Date(), days)); }

// expandRecurring: weekly/monthly counts, one-time untouched, ids + baseId
const items = [
  { id: 'w1', desc: 'Weekly client', date: isoPlus(10), amount: 500, kind: 'in', recurring: 'weekly' },
  { id: 'm1', desc: 'Monthly rent', date: isoPlus(10), amount: 1200, kind: 'out', recurring: 'monthly' },
  { id: 'o1', desc: 'One-off', date: isoPlus(10), amount: 99, kind: 'in' }
];
const exp = CF.expandRecurring(items, 13);
const wOcc = exp.filter(i => i.baseId === 'w1'), mOcc = exp.filter(i => i.baseId === 'm1'), oOcc = exp.filter(i => i.id === 'o1');
(wOcc.length >= 10 && mOcc.length >= 2 && mOcc.length <= 4 && oOcc.length === 1 && wOcc.every(i => /^w1#\d+$/.test(i.id)))
  ? ok('expandRecurring: ' + wOcc.length + ' weekly, ' + mOcc.length + ' monthly, one-off untouched, occurrence ids')
  : bad('expandRecurring counts: w=' + wOcc.length + ' m=' + mOcc.length + ' o=' + oOcc.length);
// monthly stepping keeps the day-of-month (month-end clamped)
const mDates = mOcc.map(i => i.date);
mDates.every(d => d.slice(8) === mDates[0].slice(8)) ? ok('expandRecurring: monthly keeps day-of-month') : bad('monthly dates: ' + mDates.join(','));
// past recurring items project forward from the current week — no resurrection
const past = [{ id: 'p1', desc: 'Old weekly', date: '2020-01-06', amount: 100, kind: 'in', recurring: 'weekly' }];
const pExp = CF.expandRecurring(past, 13);
const allFuture = pExp.every(i => CF.parseDate(i.date) >= CF.weekStartOf(new Date()));
(pExp.length >= 10 && allFuture) ? ok('expandRecurring: past weekly restarts at current week (' + pExp.length + ' occ)') : bad('past recurring: ' + pExp.length);
// forecast() integrates expansion: recurring bill hits multiple weeks
const fc = CF.forecast(items, 0, 13, {});
const outWeeks = fc.filter(w => w.outflow > 0).length;
outWeeks >= 2 ? ok('forecast: monthly bill lands in ' + outWeeks + ' weeks') : bad('forecast recurring integration');
// what-if shift by base id moves every occurrence of a recurring invoice
// (shifted +2: the last 2 occurrences fall past the horizon)
const shiftItems = [{ id: 'sw1', desc: 'Weekly in', date: isoPlus(10), amount: 500, kind: 'in', recurring: 'weekly' }];
const sBase = CF.forecast(shiftItems, 0, 13, {}), sLate = CF.forecast(shiftItems, 0, 13, { sw1: 2 });
const baseWk = sBase.map((w, i) => w.inflow > 0 ? i : -1).filter(i => i >= 0);
const lateWk = sLate.map((w, i) => w.inflow > 0 ? i : -1).filter(i => i >= 0);
(baseWk.length >= 10 && lateWk.length === baseWk.length - 2 && lateWk.every((w, i) => w === baseWk[i] + 2))
  ? ok('what-if: recurring invoice occurrences all shift +2 weeks') : bad('what-if recurring shift');
// forecastToCSV: header + 13 rows, items column populated
const csv = CF.forecastToCSV(fc);
const lines = csv.split('\r\n');
(lines.length === 14 && lines[0] === 'Week,Start,End,Money in,Money out,Net,Balance,Items' && /Weekly client/.test(csv))
  ? ok('forecastToCSV: header + 13 rows, items listed') : bad('forecastToCSV: ' + lines[0]);
// recurringLabel
(CF.recurringLabel({ recurring: 'weekly' }) === 'weekly' && CF.recurringLabel({ recurring: 'monthly' }) === 'monthly' && CF.recurringLabel({}) === '')
  ? ok('recurringLabel: weekly/monthly/blank') : bad('recurringLabel');
(CF.recurringLabel({ recurring: 'quarterly' }) === 'quarterly' && CF.recurringLabel({ recurring: 'yearly' }) === 'yearly')
  ? ok('recurringLabel: quarterly/yearly') : bad('recurringLabel new values');

// expandRecurring: quarterly + yearly over a 26-week horizon
const qy = [
  { id: 'q1', desc: 'Quarterly tax', date: isoPlus(10), amount: 2000, kind: 'out', recurring: 'quarterly' },
  { id: 'y1', desc: 'Yearly insurance', date: isoPlus(10), amount: 1200, kind: 'out', recurring: 'yearly' }
];
const qyExp = CF.expandRecurring(qy, 26);
const qOcc = qyExp.filter(i => i.baseId === 'q1'), yOcc = qyExp.filter(i => i.baseId === 'y1');
(qOcc.length >= 2 && qOcc.length <= 3 && yOcc.length === 1)
  ? ok('expandRecurring: quarterly x' + qOcc.length + ', yearly x' + yOcc.length + ' over 26 weeks')
  : bad('expandRecurring quarterly/yearly: q=' + qOcc.length + ' y=' + yOcc.length);
const qMonths = qOcc.map(i => +i.date.slice(5, 7));
const qGaps = qMonths.slice(1).map((m, i) => (m - qMonths[i] + 12) % 12);
qGaps.every(g => g === 3) ? ok('expandRecurring: quarterly occurrences 3 months apart') : bad('quarterly gaps: ' + qGaps.join(','));

// dedupeItems: dupes vs existing, case-insensitive, and within the same batch
const existing = [{ id: 'e1', desc: 'Acme invoice', date: '2026-10-20', amount: 500, kind: 'in' }];
const batch = [
  { id: 'n1', desc: 'Acme invoice', date: '2026-10-20', amount: 500, kind: 'in' },
  { id: 'n2', desc: 'ACME INVOICE', date: '2026-10-20', amount: 500, kind: 'in' },
  { id: 'n3', desc: 'New bill', date: '2026-10-21', amount: 100, kind: 'out' },
  { id: 'n4', desc: 'New bill', date: '2026-10-21', amount: 100, kind: 'out' }
];
const dd = CF.dedupeItems(batch, existing);
(dd.fresh.length === 1 && dd.dupes.length === 3)
  ? ok('dedupeItems: 1 fresh, 3 dupes (existing match + case-insensitive + in-batch)') : bad('dedupeItems: fresh=' + dd.fresh.length + ' dupes=' + dd.dupes.length);
(CF.dedupeItems([], []).fresh.length === 0) ? ok('dedupeItems: empty -> empty') : bad('dedupeItems empty');

// forecast honors arbitrary horizons
(CF.forecast([], 0, 4, {}).length === 4 && CF.forecast([], 0, 26, {}).length === 26)
  ? ok('forecast: 4- and 26-week horizons return that many weeks') : bad('forecast horizon');

// runwayWeeks: weeks of cash before a negative balance
const rwItems = [
  { id: 'b1', desc: 'Big bill', date: isoPlus(10), amount: 9000, kind: 'out' },
  { id: 'i1', desc: 'Client pay', date: isoPlus(40), amount: 5000, kind: 'in' }
];
const rwFc = CF.forecast(rwItems, 1000, 13, {});
const rw = CF.runwayWeeks(rwFc);
(rw >= 1 && rw <= 3 && rwFc[rw].balance < 0)
  ? ok('runwayWeeks: cash runs out at week ' + (rw + 1)) : bad('runwayWeeks: ' + rw);
(CF.runwayWeeks(CF.forecast([{ id: 'i2', desc: 'Steady', date: isoPlus(5), amount: 100, kind: 'in', recurring: 'weekly' }], 5000, 13, {})) === Infinity)
  ? ok('runwayWeeks: healthy forecast -> Infinity') : bad('runwayWeeks healthy');

// scenarioDiff: named-scenario comparison vs base
const scnItems = [{ id: 'inv1', desc: 'Acme invoice', date: isoPlus(8), amount: 4000, kind: 'in' }];
const fBase = CF.forecast(scnItems, 0, 13, {});
const fLate = CF.forecast(scnItems, 0, 13, { inv1: 3 });
const diff = CF.scenarioDiff(fBase, fLate);
(diff.baseShortfalls === fBase.filter(w => w.balance < 0).length &&
  diff.scnShortfalls === fLate.filter(w => w.balance < 0).length &&
  diff.newShortfalls === diff.scnShortfalls - diff.baseShortfalls &&
  typeof diff.minDelta === 'number' && typeof diff.endDelta === 'number')
  ? ok('scenarioDiff: shortfall counts + deltas vs base (' + diff.newShortfalls + ' new shortfall weeks)')
  : bad('scenarioDiff: ' + JSON.stringify(diff));
// scenario shifts are just multi-item shiftMaps: two shifts combine
const two = [
  { id: 'a1', desc: 'In', date: isoPlus(8), amount: 2000, kind: 'in' },
  { id: 'b1', desc: 'Out', date: isoPlus(9), amount: 1500, kind: 'out' }
];
const fBoth = CF.forecast(two, 0, 13, { a1: 2, b1: -1 });
const fOne = CF.forecast(two, 0, 13, { a1: 2 });
(fBoth.length === 13 && JSON.stringify(fBoth) !== JSON.stringify(fOne))
  ? ok('scenario: multi-item shiftMap applies both shifts') : bad('multi-shift');

console.log('NEW_PASS=' + pass + ' NEW_FAIL=' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
[ $? -eq 0 ] && ok "new-feature node checks green" || bad "new-feature node checks had failures"

# new UI hooks rendered by js/app.js (index.html is just an app shell)
for id in exportFc printReport inRec outRec editSave editCancel horizonSel scnNew scnName scnDel shiftItem shiftRange shiftAdd; do
  grep -q "id=\"$id\"\|id='$id'" js/app.js && ok "app.js renders #$id" || bad "app.js missing #$id"
done
# rebuilt chart: danger zone, balance area fill, scenario lines, no clamped line
for cls in dangerzone bal-area scn-line scn-tabs cmptable shift-add; do
  grep -q "$cls" js/app.js css/style.css && ok "chart/scenario desk has .$cls" || bad "missing .$cls"
done
[ -f REDESIGN-AUDIT.md ] && ok "REDESIGN-AUDIT.md present" || bad "REDESIGN-AUDIT.md missing"

echo "---"
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
