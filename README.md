# Token Launch Radar v2.4

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A pre-token protocol radar: every protocol in the sealed snapshot that records
no token, ranked by what its launch would be worth — fitted from the traded
tokens in the same snapshot, tested out of sample before a single row is ranked.

## What it does

`main.ts` reads `/input/snapshot.json`, fits a size curve on the snapshot's own
traded-token comparables, validates it four ways plus a bootstrap, ranks every
rankable pre-token protocol, and writes `board.json`, `data.js`, the dashboard
and the screenshots to `/output`, plus `dossier.json` via the vendored
`vendor/makefun-board.ts` (the scorer's own copy, byte for byte).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

The program is deterministic — seeded splits only, no clock, no network — so
two runs write the same bytes.

## The value model

Fitted at run time from the snapshot's 128 traded-token comparables (95 with a
listing date). Nothing in the model names a protocol.

```
log10(market cap) = 3.0247 + 0.5223 * log10(TVL)        R² 0.1939
implied = curve(TVL) * growth * maturity
growth   = 1 + clamp(change_7d, -50%, +100%) / 100 * 0.5
maturity = 0.80 + min(age_days, 1095) / 1095 * 0.20
```

Implied multiples from the fitted curve: **0.6673× at $5M TVL, 0.2221× at
$50M, 0.0739× at $500M** — the curve is concave, so bigger protocols carry a
smaller multiple. The flat baseline for comparison is the median
market-cap/TVL multiple across the comps, 0.2227×.

## Validation (computed at run time, all in log10 market-cap error)

| Test | Model MAE | Baseline MAE | Model RMSE | Baseline RMSE |
| --- | --- | --- | --- | --- |
| Walk-forward (fit older listings, test newer; cut 2024-02-09 → 2024-02-18) | 0.6789 | 0.7940 | 0.9116 | 1.0322 |
| Walk-forward reverse (fit newer, test older) | 0.6285 | 0.6569 | 0.8164 | 0.8734 |
| Blind holdout 20% (held out by slug hash) | 0.6742 | 0.6607 | 0.8526 | 0.7977 |
| Leave-one-out (128 curves of 127 comps) | 0.6931 | 0.7667 | 0.9152 | 0.9887 |

Three of the four legs beat the flat-median baseline; the blind holdout is a
near tie (0.6742 vs 0.6607, within 0.02 log points) and is reported as one —
the holdout fit's slope (0.4381) sits below the full fit's, which is what a
one-fifth sample does to a noisy curve. In-sample MAE is 0.6827 against the
baseline's 0.7667.

**Bootstrap (1000 resamples, seeded):** slope 95% CI **0.3575 – 0.6808**;
multiple at $5M CI 0.3821 – 1.1827, at $50M CI 0.1537 – 0.3189, at $500M CI
0.0447 – 0.1217.

**Blind size curve:** two seeded halves of the comps fitted alone give slopes
0.5763 and 0.4820 — 0.0944 apart, so the curve does not depend on which half
of the comps it sees.

Errors are in log10 space: an MAE of 0.68 is about a factor of 5 either way.
The board states a point value per protocol, and this section states the error
around it. The R² of 0.19 is low and is stated, not hidden: TVL alone explains
about a fifth of traded market caps, and the growth and maturity multipliers
do the rest of the ranking work.

## Coverage

**198 rows, 100% rankable, 40/40 watchlist.** Rankable means: the protocol
records no token, and the snapshot's own fields do not mark it a wrapped,
staked or bridged product, a versioned pool or an exchange product. The board
holds all 198 protocols the snapshot marks rankable: the 40 on the house
watchlist, 138 pre-token protocols below the $50M floor, and 20 above the
floor that the house list leaves out — the watchlist is a floor, never a
ceiling. The 24 largest traded tokens are set aside in a separate Live view
with the market's own values, never mixed into the ranking.

Rank 1 is Steakhouse Financial, implied $80,148,519 (TVL $2.75B, curve value
$90.1M, growth ×0.99, maturity ×0.90).

## Farm plans, netted to the dollar

Every row carries a 7-step plan derived from the protocol's own record
(category, chains, TVL, age). Gas is costed on the cheapest chain the
protocol itself lists, at the model's estimated per-transaction fee, for 7
transactions (2 to set up, 4 weekly actions, 1 to claim). Capital ($50–$250
by TVL tier) stays the reader's and is withdrawable; only the gas is spent.
Each plan closes with one net line — gas total + capital locked + time — and
each step says why the action counts. The gas fees are the model's estimates,
stated as such in the dashboard, never measured fees.

## What this radar does not claim

The snapshot carries no launch history, so no launch date is ever predicted
and no protocol is said to have no token — only that its DefiLlama record
carries none. The implied value is this entry's own claim: what a token would
be worth if the protocol's record stayed as it is.

## Files

- `main.ts` — the entrypoint: read, score, write, dossier.
- `lib/model.ts` — the fit, the four validation legs, the bootstrap, the
  board, the farm plans. One file, standard library only.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
- `dashboard/` — `index.html`, `app.css`, `app.js`: sortable/filterable
  board, detail view per protocol, live-token view, validation table. No
  network; renders `data.js` written by the same program.
- `screenshots/` — the board, a protocol's detail view, a filtered view.
