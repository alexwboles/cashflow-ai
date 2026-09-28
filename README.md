# 💸 CashFlow AI

**See 13 weeks into your business's financial future.** Enter expected invoices in and bills out, get a weekly forecast chart, shortfall alerts, a what-if late-payment simulator, and CSV import — all running 100% in your browser.

## The problem

Small businesses don't go broke from lack of profit — they go broke from bad timing. A big payroll lands the same week a customer pays late, and suddenly the account is overdrawn. Spreadsheets can model this, but nobody keeps them updated, and they never warn you.

## The solution

CashFlow AI is a single-page web app (no build step, no dependencies, no account) that:

1. **Forecasts 13 weeks** — enter expected invoice payments (money in) and bills (money out) with dates, plus your starting balance. Get a week-by-week forecast with inflow/outflow bars and a running-balance line.
2. **Alerts on shortfalls** — weeks projected below $0 get a red flag; weeks under $1,000 get a thin-cash warning.
3. **What-if late payments** — pick any invoice and slide it 0–6 weeks late. The dashed purple line shows the new balance trajectory and tells you exactly how much the lowest week drops — and whether it creates a new shortfall.
4. **CSV import** — `type,description,date,amount` (`type` = `in`|`out`), with row-level error reporting. A sample CSV ships in `data/sample.csv`.

Everything persists in `localStorage`. Optional: set `OPENAI_API_KEY` for AI-generated cash advice in a future version — nothing requires it.

## Privacy

**Nothing leaves the device.** No server, no analytics, no tracking. Your financial data stays in the browser. Serve it locally and it works offline.

## Run it

```bash
# any static server works:
npx serve .
# then open http://localhost:3000
```

Try the sample data first — it's tuned so week 6 dips negative, demonstrating the shortfall alert. Then drag the Carter HVAC invoice 2 weeks late in the what-if panel and watch what happens.

## Tests

```bash
bash test/smoke.sh   # file presence, JS syntax, core logic spot checks
bash test/e2e.sh     # full flows: forecast, shortfalls, what-if, CSV import
```

## Project structure

```
index.html          # app shell
css/style.css       # theme
js/data.js          # sample invoices/bills + starting balance
js/forecast.js      # pure engine: parsing, 13-week forecast, shortfalls, what-if (browser + node)
js/app.js           # UI rendering, SVG chart, events (browser only)
data/sample.csv     # importable sample (type,description,date,amount)
test/smoke.sh       # smoke tests
test/e2e.sh         # end-to-end flow tests
```

## Disclaimer

Forecasts are planning estimates based on the dates and amounts you enter — not financial advice. Always confirm with your accountant before making cash decisions.
