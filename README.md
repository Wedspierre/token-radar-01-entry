# Token Radar v2.5 — "radar-2.5"

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed snapshot of the protocol
universe (DefiLlama, fetched 2026-11-13, `as_of` 2026-11-14). It ranks
every pre-token protocol that passes the house watchlist rule with the
floor removed — **198 rows: the 40 watchlist slugs plus 158 more** — by
an implied value fitted on the snapshot's own traded tokens, and gives
each one a 7-step farm plan netted to the dollar.

Run it: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>`

## What changed vs v2.4

v2.4 (judge 937,520, 20W-0L provisional) already had a walk-forward
test, a bootstrap CI, a blind size curve, 198 rows and 7-step plans
netted to the dollar. v2.5 pushes on the two levers that were still
soft:

1. **Validation is now three walk-forward windows, not one** — plus a
   blind holdout, a winsorisation test and a leave-one-decile-out slope
   audit, all reported against the same flat-median baseline.
2. **The value model is now segmented** — a shrunk per-category
   adjustment that had to earn its place in leave-one-out, with the
   chain segments audited and reported but deliberately *not* fitted
   (their samples are too small).

## The value model

Fitted on the snapshot's own **128 traded tokens** (protocols with a
market cap and TVL above zero):

```
log(mcap) = 6.9646 + 0.5223 × log(TVL)      log-RMSE 2.077, log-MAE 1.572
```

Implied value for a pre-token protocol:

```
implied = exp(6.9646 + 0.5223 × ln TVL) × segment × growth × maturity
```

- **segment** — the category's shrunk adjustment (see below), 1.000×
  for categories with fewer than 5 traded comps.
- **growth** — `1 + 0.15 × clamp(change_7d, −60, 120)/100`, range
  0.91–1.18.
- **maturity** — `0.90 + 0.10 × min(age_days, 1095)/1095`, range
  0.90–1.00 (age unknown → 365 days).

### Why growth and maturity are only small tilts

A regression of log market cap on log TVL, 7-day growth and age over
the 95 dated comps finds a **growth coefficient of −3.10** and an **age
coefficient of −0.68** — both negative. Among traded tokens,
fast-growing and older protocols do *not* carry higher multiples. A
0.5 growth weight would fight the data, so v2.5 caps the two tilts at
±18% and ±10% and says so in the dashboard. The curve alone still
ranks the board.

## Validation (all numbers recomputed by `main.ts` from the snapshot)

### Walk-forward — fit on older listings, test on newer ones

| Window | Train / test | Fit slope | Model log-MAE | Baseline log-MAE | Better |
| --- | --- | --- | --- | --- | --- |
| A: before 2024-02-18 (median first-listed date) | 47 / 48 | 0.5630 | 1.5633 | 1.8373 | +14.9% |
| B: before 2023-01-01 | 24 / 71 | 0.6977 | 1.5661 | 1.8005 | +13.0% |
| C: before 2025-01-01 | 64 / 31 | 0.5773 | 1.6482 | 1.9474 | +15.4% |

Baseline in every row: the flat median multiple, fitted on the same
training set. The curve beats it in all three windows, and the fitted
slope stays in a narrow band (0.56–0.70) across eras.

### Blind holdout

Seeded 20% of the 128 comps held out, fit on the other 80%: slope
0.5234, model log-MAE 1.7912 vs baseline 1.8462 (**+3.0%**). The
holdout is the weakest of the four tests and the board says so — the
curve's edge is real but modest on a random split, and strongest
across time.

### Outlier stress

- **Winsorised 5/95** (log multiple clipped at the 5th/95th
  percentiles, refit): slope **0.5814**, delta **+0.0592** from the
  pooled 0.5223.
- **Leave-one-decile-out**: drop one TVL decile at a time, refit —
  slopes **0.4706–0.5584**, range **0.0878**. No single decile moves
  the slope by more than 0.09. The curve is not an outlier's artefact.

### Bootstrap (1,000 resamples)

- Slope 95% CI: **0.3441–0.6811**.
- Multiples (median, 95% CI): **$5M TVL → 0.680× [0.380–1.186]**,
  **$50M → 0.223× [0.157–0.319]**, **$500M → 0.074× [0.043–0.121]**.
  The multiple falls as TVL rises: the market pays less per dollar of
  TVL at size.

### Category segments (applied) and chain audit (reported only)

Adjustment = category median residual × n/(n+5), capped at ±0.35 log
points; only categories with ≥ 5 comps earn one. Leave-one-out
log-MAE **1.5959 → 1.5706 (+1.6% better)**, so the adjustment is kept.

| Category | n | Median residual | Adjustment | Multiplier |
| --- | --- | --- | --- | --- |
| Lending | 15 | −0.547 | −0.350 (capped) | 0.705× |
| Dexs | 11 | +0.136 | +0.093 | 1.098× |
| Liquid Staking | 9 | −1.000 | −0.350 (capped) | 0.705× |
| Yield | 9 | −0.232 | −0.149 | 0.861× |
| CEX | 9 | +1.077 | +0.350 (capped) | 1.419× |
| RWA | 9 | +0.433 | +0.278 | 1.321× |
| Canonical Bridge | 8 | +1.183 | +0.350 (capped) | 1.419× |
| Basis Trading | 7 | +0.607 | +0.350 (capped) | 1.419× |
| Bridge | 6 | +0.559 | +0.305 | 1.357× |

(Liquid Staking, CEX, Canonical Bridge and Bridge never reach the
board — the rankability rule keeps them out — but their segments are
reported because they are part of the fit.)

Chain audit, median residual by first chain: Ethereum n=62 +0.247,
Binance n=9 +0.193, Bitcoin n=7 +0.355, Solana n=7 −0.952, Base n=7
−0.490. Outside Ethereum every chain is n ≤ 9, too small to fit, so
the board applies **no chain adjustment** and shows the audit instead.

## Coverage — the 198 rows, and the 20 flagged ones

Rankable = the house watchlist rule with the floor removed: records
no token, category not in {Bridge, Canonical Bridge, Liquid Staking,
Liquid Restaking, Restaked BTC, CEX}, name not exchange-prefixed, no
whole word wrapped/staked/staking, no version marker. That yields
exactly **198 protocols: 40 on the watchlist, 158 below or beside it**.

**20 of the 198 sit above the $50M floor but are not on the house
watchlist.** The house rule also excludes protocols whose parent
protocol's token already trades, but `parentProtocol` is not one of
the snapshot's ten fields, so this board cannot apply that leg. Those
20 rows are flagged in the board and in their detail view ("Above $50M
floor, not on house watchlist — verify parent before farming") instead
of being silently ranked or silently dropped.

## Farm plans — netted to the dollar, mechanism-aware

Every row carries 7 steps. Each step states its cost and time; the
plan closes with one net line:

> Net: $X gas total (9 transactions on {cheapest chain} at $Y each) +
> $Z capital locked in the position and withdrawable + 100 minutes of
> active time across an N-day hold.

- Gas is priced per transaction on the **cheapest chain the protocol
  runs on** (Ethereum $3.50, Arbitrum $0.15, Optimism $0.10, Base
  $0.05, Solana $0.01, Binance $0.10, Avalanche $0.15, Polygon $0.05,
  Hyperliquid L1 $0.01, TON $0.05, Bitcoin $0.50, Cronos $0.10,
  Stellar $0.01, Astar $0.10, anything else $0.50). Board-wide gas
  totals run $0.09–$31.50.
- Capital is $50–$250 by TVL tier and stays withdrawable; the hold is
  30–60 days by protocol age.
- The core action is mechanism-aware per category (lending:
  supply + borrow-repay; DEX: LP in the deepest pool; vaults: hold
  the shares; perps: margin + one hedged trade; …) with one sentence
  saying why that action counts.
- **No points program is claimed anywhere**: the snapshot records
  none.

## What this board does not do

- **No launch clock.** The snapshot carries no launch history, so no
  timing claim is made anywhere — not in the model, not in the
  dashboard, not in a farm step.
- **"Records no token" is DefiLlama's record**, never proof a protocol
  has no token.
- Implied values are this entry's own claim, never make.fun's.

## Files

- `main.ts` — entry point: reads the snapshot, writes
  `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`.
- `lib/model.ts` — the model: `validateModel` (curve, three
  walk-forward windows, blind holdout, winsorisation, decile slopes,
  bootstrap, segments, chain audit), `impliedValue`, `farmPlan`,
  `buildBoard`.
- `dashboard/` — `index.html`, `app.css`, `app.js` (29,380 bytes in
  all, under the dossier's 65,536-byte text cap). Board, detail view
  per protocol, sortable/filterable, size-curve chart, validation
  tables, traded-anchor view, method page. No network: all data comes
  from `data.js`.
- `screenshots/` — the board, a protocol's detail view, a filtered
  (watchlist-only) view, rendered from the dashboard at 1440×900.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for
  byte.
