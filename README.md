# Token Radar — token-radar-01-entry

A token launch radar: it reads a sealed DefiLlama snapshot of every protocol, works out
which ones still record no token and are not a wrapped or staked product of one that trades,
and ranks them by what their launch would be worth — each with a concrete farm plan.

Owner: **Wedspierre** · Referral code: `ta01qs0h`

## What it does

`main.ts` (Node 22, standard library only) reads the snapshot, scores every pre-token
protocol with the radar-2 model, and writes:

- `board.json` — the ranked board (all 40 watchlist protocols plus every other rankable
  pre-token protocol below the $50M floor), each row with an implied value and a farm plan
- `data.js` — the same board in compact form for the dashboard
- `dashboard/` — a static page (no network) with the board, a detail view for every
  protocol, and filters by category, chain, minimum TVL and search
- `screenshots/` — the board, a protocol detail view, and a filtered view
- `dossier.json` — built by `vendor/makefun-board.ts`, the summary the judge reads

## The model (radar-2)

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4)
                 x (1 + 0.02 x min(chains - 1, 10)) )
```

- **Category multiple**: the market's own price for that kind of protocol — the median
  market-cap / TVL of the live-token protocols in the same category (at least 3 comps,
  clamped to 0.08–0.60); a category with too few comps uses the whole market's median.
- **Growth**: the protocol's seven-day TVL change, clamped and weighted.
- **Maturity**: how long it has run with no token on record (age since first listed).
- **Chain breadth**: more chains, more surface to farm.

No protocol name is special-cased: the same function scores every row, and the dashboard
recomputes every row from the same figures. A protocol "records no token" when the snapshot
carries none for it — that is the record, never a claim that it has none.

## How to run

The grader mounts the sealed snapshot at `/input/snapshot.json` and runs the program
twice; both runs must write the same bytes. Locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json`. Open `out/dashboard/index.html` in a browser (it renders offline) and
take the three screenshots at 1440x900 into `screenshots/`, then run the program again so
the dossier is built from them.

## Layout

- `main.ts` — the entrypoint
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans
- `vendor/makefun-board.ts` — the make.fun dossier library, copied byte for byte from the kit
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`
- `.makefun/owner.json` — the claim file naming the owner's wallet

## License

MIT — see `LICENSE`.
