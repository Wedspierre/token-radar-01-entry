# Token Radar v2.3

A token launch radar: 198 pre-token protocols ranked by what a launch would be worth,
each with a farm plan netted to the dollar. Built for the make.fun `token-radar-01`
bounty (program/v1, judged by an AI judge on the dossier).

## What it does

`main.ts` reads the sealed snapshot (`/input/snapshot.json`, DefiLlama's protocol index
as fetched 2026-11-14), fits a size curve on the snapshot's own traded tokens, scores
every rankable pre-token protocol, and writes the board, the dashboard data and the
dossier to `/output`.

## The model (radar-2.3)

```
log10(market cap) = 4.8350 + 0.3624 × log10(TVL) − 0.2092 × log10(age_days + 1)
```

- **Comps:** 93 traded protocols with a market cap, one per ticker (largest market cap
  wins the ticker), CEX and bridge-family categories set aside the same way the
  watchlist rule sets them aside. Every coefficient is fitted at run time from the
  snapshot this run reads; no protocol name is special-cased.
- **Term selection:** forward selection over the term sets {growth, age}. A term is
  kept only when it wins at least 2 of 3 out-of-sample tests against the model without
  it. The age term wins the blind mean and the time-split; the growth term wins only
  the time-split and its fitted sign flips across blind seeds (+0.91, −0.53, −0.76,
  −1.35, −1.16), so it is dropped.
- **Out-of-sample error** (mean absolute error, log10 dollars; lower is better):

  | Test | Chosen model | Flat median multiple |
  | --- | --- | --- |
  | Blind holdout (mean of 5 seeded 20% holdouts) | 0.6219 | 0.7248 |
  | Time-split (fit pre-2024-07-08, test newer half) | 0.6310 | 0.8042 |
  | Leave-one-out | 0.6557 | 0.7393 |

- **Bootstrap (1,000 resamples):** slope 95% CI [0.1056, 0.6033]; fitted multiple at
  one year of age 0.245x at $50M TVL, 95% CI [0.141, 0.438] (at $5M [0.463, 2.923],
  at $500M [0.028, 0.118]). Rank ranges on the board come from 200 further refits;
  the median row moves ±64 ranks.
- **Coverage:** the board ranks all 198 rankable pre-token protocols — the 40 on the
  watchlist plus the 158 below the $50M floor that pass the watchlist's own rule. Of
  the 342 pre-token protocols in the snapshot, 144 are set aside by that rule: 42 CEX,
  86 bridge-family categories, 11 versioned pools, 5 wrapped/staked names.
- **Farm plans:** 7 steps plus a net line. Gas is priced per transaction on the
  cheapest chain the protocol runs on that the gas table covers (estimates, stated as
  such; a chain with no estimate is priced at a flagged $1.00 default). The plan
  counts its own transactions (2 to open, 1 a week of holding, 1 for a second touch)
  and the last step states the net: gas sunk, capital locked and withdrawable, minutes
  of the reader's time.

## The dashboard

A static page, no framework and no network: `dashboard/index.html`, `app.css`,
`app.js`, reading `data.js` written beside it. The board (search, category and chain
filters, sortable columns), a detail view per protocol (model breakdown, rank range,
netted farm plan), the live-token set the curve is fitted on, and a Method tab with
the term-selection table, the bootstrap intervals, the coverage audit and the gas
table. The page replays the fitted curve from the coefficients in `data.js` and
checks the number against `board.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to the kit's input dir>
```

Node 22.18 or later, standard library only, no install. Two runs write the same
bytes. Screenshots live in `screenshots/` (board, detail, filtered) and are copied
to `/output` by the run.

## Files

- `main.ts` — entrypoint: fit, test, score, write, dossier.
- `lib/model.ts` — the model: comps, term selection, OOS tests, bootstrap, rank
  stability, farm plans, board.
- `dashboard/` — the page the judge reads.
- `screenshots/` — the three screenshots of it.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte from the kit.
- `board.json`, `data.js`, `dossier.json` — the last local run's outputs, kept in
  the repo so the entry is self-consistent at the submitted commit.

## Honest limits

- Implied value is the model's claim, not a price, and no token is promised: a
  protocol on this board records no token, which is not proof it has none.
- The curve's R² is 0.10 — TVL and age explain little of traded multiples, and the
  rank ranges say so. The model beats a flat median multiple out of sample; it does
  not predict launches.
- Gas figures are estimates per transaction, not quotes; 38 of 198 rows fall back to
  the flagged $1.00 default because their chains have no estimate in the table.
- Nothing here is financial advice.
