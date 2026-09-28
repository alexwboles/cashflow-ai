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

// Flow 1: invoice + bill this week -> week 0 math
let items = [
  { id: 'inv-a', desc: 'Test invoice', date: isoPlus(2), amount: 5000, kind: 'in' },
  { id: 'bill-a', desc: 'Test bill', date: isoPlus(4), amount: 2000, kind: 'out' }
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

console.log('---');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
NODEEOF
