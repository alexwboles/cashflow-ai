# REDESIGN-AUDIT — cashflow-ai (2026-10-13)

Competitors referenced: **Float** (scenario planning, cash graph, budget-vs-actual, alerts), **Pulse** (charts, project/client filters), **Brixx** (multi-scenario, forecast-vs-actual).

## Visual gaps vs competitors
- The cash graph — Float's hero — is distorted: the balance line clamps negative balances to zero (`Math.max(0, w.balance)`), drawing a false V through the danger zone instead of dipping below the zero line into a red band. It reads as a bug, not a plan.
- In/out bars share the axis with the balance line, so the line (the thing a treasurer watches) is visually buried under $16k bars.
- No danger-zone band below zero; shortfall weeks are only red text above the chart.
- Rounded `rx="2"` on chart bars (violates the no-rounded-edges rule).
- Stats band is fine (tone-coded), but lacks the one number Float users check daily: **cash runway**.

## Functional gaps vs competitors
1. **No named scenarios.** Float's signature move is creating, layering, and comparing scenarios ("can we afford the hire?", "what if our biggest client pays 3 weeks late?"). CashFlow has one ad-hoc single-item shift slider — no names, no persistence, no side-by-side comparison.
2. **No forecast-vs-actuals.** (Parked: needs real accounting sync; out of scope for a local tool.)
3. **No runway metric.** Float/Brixx surface weeks-of-cash at a glance.
4. What-if is limited to ONE item shift; real what-ifs combine several moves (late payment + delayed bill).

## What this redesign does (bounded)
- Rebuilt chart: balance line is the hero (thick brass, area fill), in/out bars slimmed behind it, a red-tint **danger zone below zero**, unclamped negatives, no rounded bars.
- **Scenario desk** (replaces the single-item what-if): Base + up to 3 named scenarios, each holding multiple item shifts; all scenario balances drawn as layered dashed lines; a comparison table (ending balance, lowest week, shortfall weeks, delta vs base); scenarios persist in localStorage.
- New **cash runway** stat tile (weeks until balance goes negative).
- All existing features preserved: recurring items, horizon selector, low-cash alert level, ledger tables + inline edit, CSV import/export with dedupe, print.
