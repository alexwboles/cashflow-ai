#!/bin/bash
# CashFlow e2e tests — full forecast flows, dates relative to today (time-robust).
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
node << 'NODEEOF'
const CF = require('/home/hatch/workspace/cashflow-ai/js/forecast.js');
const fs = require('fs');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

function isoPlus(days) { return CF.toISODate(CF.addDays(new Date(), days)); }

// Flow 1: invoice + bill this week -> week 0 math (anchored to weekStartOf: time-robust)
const wk0 = CF.weekStartOf(new Date());
let items = [
  { id: 'inv-a', desc: 'Test invoice', date: CF.toISODate(CF.addDays(wk0, 2)), amount: 5000, kind: 'in' },
  { id: 'bill-a', desc: 'Test bill', date: CF.toISODate(CF.addDays(wk0, 4)), amount: 2000, kind: 'out' }
];
let fc = CF.forecast(items, 1000, 13, {});
(fc[0].inflow === 5000 && fc[0].outflow === 2000 && fc[0].net === 3000 && fc[0].balance === 4000)
  ? ok('flow1: week 0 in 5000 / out 2000 / balance 4000') : bad('flow1: ' + JSON.stringify(fc[0]));

// Flow 2: big bill with no income -> critical shortfall flagged
items = [{ id: 'bill-b', desc: 'Huge bill', date: isoPlus(9), amount: 10000, kind: 'out' }];
fc = CF.forecast(items, 1000, 13, {});
const sf = CF.shortfalls(fc);
const critWeeks = sf.critical.map(w => w.index);
(critWeeks.length >= 1 && fc[critWeeks[0]].balance < 0)
  ? ok('flow2: shortfall flagged at week(s) ' + critWeeks.join(',')) : bad('flow2: no critical shortfall');

// Flow 3: what-if — invoice 2 weeks late shifts inflow, lowers min balance
items = [
  { id: 'inv-w', desc: 'Big invoice', date: isoPlus(9), amount: 8000, kind: 'in' },
  { id: 'bill-w', desc: 'Payroll', date: isoPlus(10), amount: 6000, kind: 'out' }
];
const base = CF.forecast(items, 1000, 13, {});
const late = CF.forecast(items, 1000, 13, { 'inv-w': 2 });
const tB = CF.totals(base), tL = CF.totals(late);
const wInBase = base.findIndex(w => w.inflow === 8000);
const wInLate = late.findIndex(w => w.inflow === 8000);
(wInLate === wInBase + 2 && tL.minBalance < tB.minBalance)
  ? ok('flow3: 2-week delay moves inflow wk' + wInBase + '->wk' + wInLate + ', min ' + CF.money(tB.minBalance) + '->' + CF.money(tL.minBalance))
  : bad('flow3: what-if shift wrong (base wk ' + wInBase + ', late wk ' + wInLate + ')');

// Flow 4: CSV import end-to-end on sample.csv
const text = fs.readFileSync('/home/hatch/workspace/cashflow-ai/data/sample.csv', 'utf8');
const res = CF.rowsToItems(CF.parseCSV(text));
const fcCsv = CF.forecast(res.items, 4000, 13, {});
const t = CF.totals(fcCsv);
const sumIn = res.items.filter(i => i.kind === 'in').reduce((s, i) => s + i.amount, 0);
const sumOut = res.items.filter(i => i.kind === 'out').reduce((s, i) => s + i.amount, 0);
(Math.abs(t.totalIn - sumIn) < 0.01 && Math.abs(t.totalOut - sumOut) < 0.01)
  ? ok('flow4: totals reconcile (in ' + CF.money(t.totalIn) + ', out ' + CF.money(t.totalOut) + ')')
  : bad('flow4: totals mismatch');

// Flow 5: overdue item (yesterday) lands in week 0, not lost
items = [{ id: 'inv-past', desc: 'Overdue invoice', date: isoPlus(-1), amount: 1500, kind: 'in' }];
fc = CF.forecast(items, 0, 13, {});
(fc[0].inflow === 1500) ? ok('flow5: overdue item counted in week 0') : bad('flow5: overdue item lost');

// Flow 6: bad CSV rows rejected with errors, good rows kept
const badCsv = 'type,description,date,amount\nin,Good row,2026-10-05,100\nxx,Bad type,2026-10-05,100\nin,Bad date,not-a-date,100\nout,Bad amount,2026-10-05,-50\nin,,2026-10-05,100\n';
const r2 = CF.rowsToItems(CF.parseCSV(badCsv));
(r2.items.length === 1 && r2.errors.length === 4)
  ? ok('flow6: 1 good row kept, 4 bad rows rejected with errors') : bad('flow6: ' + r2.items.length + ' kept, ' + r2.errors.length + ' errors');

// Flow 7: empty forecast — balances flat, no shortfalls
fc = CF.forecast([], 2500, 13, {});
const t7 = CF.totals(fc);
(t7.endBalance === 2500 && t7.minBalance === 2500 && CF.shortfalls(fc).critical.length === 0)
  ? ok('flow7: empty forecast holds $2,500 flat, no alerts') : bad('flow7: ' + JSON.stringify(t7));

// Flow 8: weekly recurring invoice — inflow lands in nearly every week of the horizon
items = [{ id: 'inv-r', desc: 'Retainer — weekly', date: isoPlus(3), amount: 1000, kind: 'in', recurring: 'weekly' }];
fc = CF.forecast(items, 0, 13, {});
const inflowWeeks = fc.filter(w => w.inflow === 1000).length;
const t8 = CF.totals(fc);
(inflowWeeks >= 11 && Math.abs(t8.totalIn - inflowWeeks * 1000) < 0.01)
  ? ok('flow8: weekly retainer in ' + inflowWeeks + '/13 weeks, totals reconcile at ' + CF.money(t8.totalIn)) : bad('flow8: ' + inflowWeeks + ' weeks');

// Flow 9: monthly recurring bill — a few occurrences, unique ids, baseId linkage
items = [{ id: 'bill-r', desc: 'Office rent', date: isoPlus(3), amount: 1800, kind: 'out', recurring: 'monthly' }];
fc = CF.forecast(items, 0, 13, {});
const rentWeeks = fc.filter(w => w.outflow === 1800);
const rentItems = rentWeeks.flatMap(w => w.items);
(rentWeeks.length >= 2 && rentWeeks.length <= 4 && rentItems.every(i => i.baseId === 'bill-r') && new Set(rentItems.map(i => i.id)).size === rentItems.length)
  ? ok('flow9: monthly rent in ' + rentWeeks.length + ' weeks, unique occurrence ids, baseId linked') : bad('flow9: rent weeks=' + rentWeeks.length);

// Flow 10: what-if late payment shifts ALL occurrences of a recurring invoice
// (the last 3 occurrences fall past the 13-week horizon when shifted +3)
items = [
  { id: 'inv-rr', desc: 'Weekly client', date: isoPlus(3), amount: 700, kind: 'in', recurring: 'weekly' },
  { id: 'bill-x', desc: 'Fixed bill', date: isoPlus(20), amount: 5000, kind: 'out' }
];
const fBase = CF.forecast(items, 2000, 13, {});
const fLate = CF.forecast(items, 2000, 13, { 'inv-rr': 3 });
const wkBase = fBase.map((w, i) => w.inflow > 0 ? i : -1).filter(i => i >= 0);
const wkLate = fLate.map((w, i) => w.inflow > 0 ? i : -1).filter(i => i >= 0);
(wkBase.length >= 10 && wkLate.length === wkBase.length - 3 && wkLate.every((w, i) => w === wkBase[i] + 3) && CF.totals(fLate).minBalance <= CF.totals(fBase).minBalance)
  ? ok('flow10: 3-week delay shifts all ' + wkLate.length + ' in-horizon retainer occurrences +3 wks; min balance drops or holds') : bad('flow10: recurring what-if');

// Flow 11: forecast CSV export — 13 data rows, items behind the numbers
const csv = CF.forecastToCSV(fBase);
const rows = csv.split('\r\n');
(rows.length === 14 && rows[0] === 'Week,Start,End,Money in,Money out,Net,Balance,Items' && rows[1].indexOf('Wk 1,') === 0 && /Weekly client/.test(rows[1]) && /Fixed bill/.test(csv))
  ? ok('flow11: forecast CSV = header + 13 weeks, item details included') : bad('flow11: csv rows=' + rows.length);

// Flow 12: past recurring item projects forward (no back-dated resurrection)
items = [{ id: 'inv-old', desc: 'Legacy weekly', date: '2024-06-03', amount: 250, kind: 'in', recurring: 'weekly' }];
fc = CF.forecast(items, 0, 13, {});
const w0 = CF.toISODate(CF.weekStartOf(new Date()));
const occDates = fc.flatMap(w => w.items).map(i => i.date);
(occDates.length >= 10 && occDates.every(d => d >= w0))
  ? ok('flow12: legacy weekly restarts this week — ' + occDates.length + ' forward occurrences, none back-dated') : bad('flow12: ' + occDates.length + ' occ');

console.log('---');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
NODEEOF
