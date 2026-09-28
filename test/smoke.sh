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

echo "---"
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
