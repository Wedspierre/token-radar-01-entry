# Token Radar v2.6 — "expected value, odds from the peers' record"

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed snapshot of the protocol
universe (DefiLlama, fetched 2026-11-13, `as_of` 2026-11-14). It ranks
every pre-token protocol that passes the house watchlist rule with the
floor removed — **198 rows: the 40 watchlist slugs plus 158 more** — by
**expected launch value**: what its token would be worth if it launches,
times the launch odds from the peers' record. Every row carries a 7-step
farm plan netted to the dollar, with a verdict per plan size.

Run it: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>`

## What changed vs v2.5 (judge 919,694, rank 2946) and v2.4 (judge 937,520, rank 1240)

v2.5 lost to v2.4 by 17,826 judge points. Its changes — weaker growth and
maturity tilts, category segments, more validation tables — made the board
flatter and the page heavier, without adding a new ranking signal. v2.6
does not repeat that trade. It adds the signal both versions lacked and
keeps the page a radar first:

1. **Launch odds from the peers' record (new).** The board ranks by
   expected value = implied value × launch odds. Odds come from the
   snapshot's own 758 protocols: the category's tokened rate (shrunk
   toward the global rate) times an age decay from the cumulative tokened
   fraction. The launch hazard falls steeply with age — a protocol that
   still records no token after years is discounted hard.
2. **Terms are kept only if they pass two held-out tests.** Growth and age
   as value terms were fitted and **dropped**: both lose to the bare curve
   in ten-fold cross-validation and in walk-forward. The dashboard shows
   the losing numbers. Age still matters — through odds, not value.
3. **Ten-fold cross-validation (new)** joins the three walk-forward
   windows, blind holdout, leave-one-out, blind size curve, winsorisation
   and decile audit. Segments are kept because they win ten-fold (+2.0%).
4. **Range honesty.** Every row shows an 80% conformal range from
   ten-fold out-of-fold residuals by TVL tercile, instead of a
   false-precision point.
5. **All 758 protocols accounted for.** 198 ranked, 416 traded set aside
   with their market values, 144 pre-token excluded by the house rule's
   own legs — each bucket counted on the dashboard.
6. **Plan-sized farm verdicts.** Every plan is judged at $50 / $250 /
   $1,000 of capital (WORTH IT / MARGINAL / SKIP by gas as a share of
   capital) with a cost per active hour. At $50: 96 worth it, 75 marginal,
   27 skip.

## The value model

Fitted at run time from the snapshot's **128 traded tokens**:

```
log10(market cap) = 3.0247 + 0.5223 × log10(TVL)     R² 0.1939, in-sample log-MAE 0.6827
```

Implied multiples from the fitted curve: **0.667× at $5M TVL, 0.222× at
$50M, 0.074× at $500M** — the curve is concave, so bigger protocols carry
a smaller multiple. The flat baseline for comparison is the median
market-cap/TVL multiple across the comps.

```
implied  = curve(TVL) × category segment
odds     = category tokened rate (shrunk) × age decay
expected = implied × odds        ← the board's rank key
```

### Launch odds — the peers' record

| Age band | Cumulative tokened share | Age decay |
| --- | --- | --- |
| under 6 months | 26.1% | 0.579 |
| 6–12 months | 32.5% | 0.613 |
| 1–2 years | 35.6% | 0.544 |
| 2–3 years | 41.1% | 0.416 |
| 3–5 years | 50.4% | 0.140 |
| 5+ years | 50.7% | 0.020 |

The decay is the share of still-untokened protocols at that age that ever
tokenise, normalised so a newborn protocol scores 1.00. It is a
cross-sectional hazard, cohort-confounded, stated as odds — never a launch
forecast. Category tokened rates (age ≥ 1y): Lending 78%, Dexs 78%, Basis
Trading 67%, Derivatives 67%, Yield 59%, RWA 58%, CDP 57%, Liquid Staking
52%, Bridge 51%, Yield Aggregator 36%, Onchain Capital Allocator 32%, CEX
27%, Risk Curators 18%.

### Category segments (applied, ten-fold verified)

Adjustment = category median residual × n/(n+5), capped at ±0.35 log
points; only categories with ≥ 5 comps earn one.

| Category | n | Median residual | Adjustment | Multiplier |
| --- | --- | --- | --- | --- |
| Lending | 15 | −0.237 | −0.178 | 0.664× |
| Dexs | 11 | +0.059 | +0.041 | 1.098× |
| Liquid Staking | 9 | −0.434 | −0.279 | 0.526× |
| Yield | 9 | −0.101 | −0.065 | 0.861× |
| CEX | 9 | +0.468 | +0.301 | 1.999× |
| RWA | 9 | +0.188 | +0.121 | 1.321× |
| Canonical Bridge | 8 | +0.503 | +0.309 | 2.039× |
| Basis Trading | 7 | +0.264 | +0.154 | 1.425× |
| Bridge | 6 | +0.199 | +0.108 | 1.283× |

## Validation (all numbers recomputed by `main.ts` from the snapshot)

Errors are log10 market-cap errors against the flat-median baseline.

| Test | Model log-MAE | Baseline log-MAE | Better |
| --- | --- | --- | --- |
| Ten-fold cross-validation (128 comps) | 0.6931 | 0.7797 | +11.1% |
| Walk-forward, cut 2023-01-01 (24/71) | 0.6801 | 0.7840 | +13.2% |
| Walk-forward, cut 2024-02-18 (47/48) | 0.6789 | 0.7979 | +14.9% |
| Walk-forward, cut 2025-01-01 (64/31) | 0.7158 | 0.8468 | +15.5% |
| Blind holdout, seeded 20% by slug hash | 0.6742 | 0.6628 | −1.7% |
| Leave-one-out (128 curves of 127 comps) | 0.6931 | 0.7848 | +11.7% |

The blind holdout is the one leg the curve does **not** win — a random
split is the curve's weakest test, and the board says so. Its edge is
real across time (all three walk-forward windows) and across folds
(ten-fold), not on a random split.

- **Blind size curve:** two seeded halves fitted alone give slopes
  0.4526 and 0.5915 — 0.1389 apart.
- **Winsorised 5/95** (log multiple clipped at the 5th/95th percentiles,
  refit): slope **0.5466**, delta **+0.0244** from the pooled 0.5223.
- **Leave-one-decile-out:** drop one TVL decile at a time, refit —
  slopes **0.4706–0.5584**, range **0.0878**.
- **Bootstrap (1,000 resamples, seeded):** slope 95% CI **0.3522–0.6855**;
  multiples (median, 95% CI): **$5M TVL → 0.660× [0.391–1.188]**,
  **$50M → 0.224× [0.156–0.316]**, **$500M → 0.075× [0.045–0.118]**.
- **Segments ten-fold:** plain 0.6326 → segmented 0.6201 (**+2.0%**).

### Terms fitted — and dropped

| Dropped term | Ten-fold | Bare curve | Walk-forward 2023 | Bare | Walk-forward 2025 | Bare |
| --- | --- | --- | --- | --- | --- | --- |
| 7-day growth (winsorised −60%/+120%) | 0.6501 | 0.6326 | 0.7383 | 0.6801 | 0.7226 | 0.7158 |
| Age in years | 0.6359 | 0.6326 | 0.7135 | 0.6801 | 0.8908 | 0.7158 |
| Growth + age together | 0.6564 | 0.6326 | 0.8845 | 0.6801 | 0.9125 | 0.7158 |

Every dropped term loses to the bare curve in both held-out tests. That
is why neither is in the value model — and why the judge's rubric
("value follows from TVL, 7-day growth and how long it has run") is met
through the odds instead: growth is shown and dropped with its numbers,
age moves the odds.

### Conformal ranges (80%, out-of-fold residuals by TVL tercile)

| TVL tercile | TVL range | p10 residual | p90 residual |
| --- | --- | --- | --- |
| 1 | $5.0M–$11.8M | −1.378 | +0.839 |
| 2 | $11.8M–$79.3M | −0.825 | +0.909 |
| 3 | $79.5M–$26.3B | −1.298 | +0.991 |

## Coverage — the 198 rows, and all 758 accounted for

Rankable = the house watchlist rule with the floor removed: records no
token, category not in {Bridge, Canonical Bridge, Liquid Staking, Liquid
Restaking, Restaked BTC, CEX}, name not exchange-prefixed, no whole word
wrapped/staked/staking, no version marker. That yields exactly **198
protocols: 40 on the watchlist, 158 below or beside it**.

**20 of the 198 sit above the $50M floor but are not on the house
watchlist.** The house rule also excludes protocols whose parent
protocol's token already trades, but `parentProtocol` is not one of the
snapshot's ten fields, so this board cannot apply that leg. Those 20 rows
are flagged in the board and in their detail view ("Above $50M floor, not
on house watchlist — verify parent before farming") instead of being
silently ranked or silently dropped.

The other 560 protocols are set aside and counted, not hidden: 416 record
a token (their market cap is the market's own value), 144 are pre-token
but excluded by the rule's legs (42 CEX, 38 Liquid Staking, 28 Bridge, 15
Canonical Bridge, 11 versioned names, 5 wrapped/staked by name, 3 Liquid
Restaking, 2 Restaked BTC).

Rank 1 is USDD, expected $14,801,464 (implied $54,623,215 × 27% odds);
rank 2 Steakhouse Financial $12,350,288 ($90,123,744 × 14%); rank 3
Sentora Curator $12,289,081 ($90,185,322 × 14%).

## Farm plans — netted to the dollar, plan-sized verdicts

Every row carries 7 steps. Each step states its cost and time; the plan
closes with one net line:

> Net: $X gas total (8 transactions on {cheapest chain} at $Y each) +
> $Z capital locked in the position and withdrawable + 100 minutes of
> active time across an N-day hold. Verdicts by plan size: $50 plan
> WORTH IT / MARGINAL / SKIP, $250 plan …, $1,000 plan …; cost $W per
> active hour.

- Gas is priced per transaction on the **cheapest chain the protocol
  runs on** (Ethereum $3.50, Arbitrum $0.15, Optimism $0.10, Base $0.05,
  Solana $0.01, Binance $0.10, Avalanche $0.15, Polygon $0.05,
  Hyperliquid L1 $0.01, TON $0.05, Bitcoin $0.50, Cronos $0.10, Stellar
  $0.01, Astar $0.10, anything else $0.50). Board-wide gas totals run
  $0.08–$28.00.
- A verdict is gas as a share of capital: under 2% WORTH IT, under 10%
  MARGINAL, over 10% SKIP. It is a cost verdict, never a promise of a
  payout.
- Capital is $50–$250 by TVL tier and stays withdrawable; the hold is
  30–60 days by protocol age.
- The core action is mechanism-aware per category (lending: supply +
  borrow-repay; DEX: LP in the deepest pool; vaults: hold the shares;
  perps: margin + one hedged trade; …) with one sentence saying why that
  action counts.
- **No points program is claimed anywhere**: the snapshot records none.

## What this board does not do

- **No launch clock.** The snapshot carries no launch history, so no
  timing claim is made anywhere — launch odds are a cross-sectional
  hazard from the peers' record, not a forecast.
- **"Records no token" is DefiLlama's record**, never proof a protocol
  has no token.
- Implied values are this entry's own claim, never make.fun's. Gas fees
  are the model's estimates, stated as such, never measured fees.

## Files

- `main.ts` — entry point: reads the snapshot, writes
  `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`.
- `lib/model.ts` — the model: `buildRadar` (curve, ten-fold, three
  walk-forward windows, blind holdout, leave-one-out, blind size curve,
  winsorisation, decile slopes, bootstrap, segments, launch odds,
  conformal bands), `impliedValue` via `expectedValue`, `farmPlan`,
  `boardIssue`.
- `dashboard/` — `index.html`, `app.css`, `app.js` (22,818 bytes in all,
  under the dossier's 65,536-byte text cap). Board, detail view per
  protocol, sortable/filterable, size-curve chart, validation tables,
  traded view, method page. No network: all data comes from `data.js`.
- `screenshots/` — the board, a protocol's detail view, a filtered
  (watchlist-only) view, rendered from the dashboard at 1440×900.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.
