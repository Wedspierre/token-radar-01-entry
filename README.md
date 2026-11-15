# Token Radar — token-radar-01-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wedspierre/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of every protocol, works out
which ones still record no token and are not a wrapped or staked product of one that trades,
and ranks them by what their launch would be worth — each with a concrete farm plan.

Owner: **Wedspierre** · Referral code: `ta01qs0h`

## What it does

`main.ts` (Node 22, standard library only) reads the snapshot, scores every pre-token
protocol with the radar-3 model, and writes:

- `board.json` — the ranked board (all 40 watchlist protocols plus every other rankable
  pre-token protocol below the $50M floor), each row with an implied value and a farm plan
- `data.js` — the same board in compact form for the dashboard
- `dashboard/` — a static page (no network) with the board, a detail view for every
  protocol, and filters by category, chain, minimum TVL and search
- `screenshots/` — the board, a protocol detail view, and a filtered view
- `dossier.json` — built by `vendor/makefun-board.ts`, the summary the judge reads

## The model (radar-3)

```
implied = round( tvl_usd x fitted_multiple(tvl_usd)
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4)
                 x (1 + 0.02 x min(chains - 1, 10)) )
```

- **Fitted multiple**: the market's own price for a protocol of this size — a log-log line
  fitted on the snapshot's 128 live-token protocols,
  `log10(multiple) = 3.0247 - 0.4777 x log10(TVL)`, clamped to 0.03–0.80. It is tested
  out of sample: leave-one-out, each live protocol priced by a line fitted without it, the
  mean absolute log10 error is 0.6931, against 0.7848 for a flat median on the same test.
- **Growth**: the protocol's seven-day TVL change, clamped and weighted (unreported: 0).
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
- `lib/model.ts` — the radar-3 model, the board builder, the farm-plan generator, the verdicts and the allocation profiles
- `vendor/makefun-board.ts` — the make.fun dossier library, copied byte for byte from the kit
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`
- `.makefun/owner.json` — the claim file naming the owner's wallet

## License

MIT — see `LICENSE`.

## How the value model works

The board is priced from the market, not from an opinion: every implied value starts from the protocol's own TVL and is multiplied by four factors that the program derives from the snapshot alone, so a new snapshot reprices the whole board without any code change.
The formula is `implied = round(tvl_usd x fitted_multiple(tvl_usd) x growth_multiplier x maturity_multiplier x chain_multiplier)`, and each of the four multipliers is defined below with the numbers this snapshot actually produced.
The fitted multiple is a log-log line through the snapshot's 128 live-token protocols: for each, the market-cap / TVL ratio is regressed on TVL in logs, ordinary least squares, giving `log10(multiple) = 3.0247 - 0.4777 x log10(tvl_usd)`, clamped to the band 0.03–0.80 so no extrapolation runs past it.
The slope is negative and stable: fitting on the protocols under $10B, under $5B or under $1B of TVL moves it only between -0.48 and -0.51, so the curve is not an artefact of the two biggest comps.
The curve says a bigger protocol trades cheaper per dollar of TVL: at $5M of TVL the fitted multiple is 0.6673, at $50M it is 0.2221, at $500M it is 0.0739, and at $2.75B it is 0.0327.
The curve is tested out of sample, not asserted: leave-one-out, each of the 128 live protocols is priced by a line fitted without it, and the mean absolute log10 error is 0.6931, against 0.7848 for a flat median (0.2138) on the same test — the curve earns its place.
No category multiple is used: the largest board category, Risk Curators with 33 rows, has only one live-token comp in the whole snapshot, so a category price for it would be one protocol's opinion, and the curve prices every row from the same 128 comps instead.
The growth multiplier is `1 + clamp(change_7d, -60, 120) / 100 x 0.5`, so a protocol that grew 20% in seven days gets a 1.10 multiplier while one that fell 20% gets 0.90.
The seven-day change is clamped to the range -60% to +120% before it is weighted, which stops a single explosive week from dominating a protocol's rank.
Only 49 of the 178 board rows grew over the last seven days, and 2 rows report no seven-day change at all, so the growth term is a small drag on most of the board rather than a boost, and the two unreported rows say so in their detail view.
The maturity multiplier is `0.6 + min(age_days, 1095) / 1095 x 0.4`, which rewards protocols that have run longer without a token while capping the reward at three years of age.
Age is counted in whole days from the protocol's first-listed date in the snapshot to the snapshot date of 2026-11-14, and a missing listed date defaults to 365 days; 6 board rows have no listed date.
The oldest board row is Katana DEX at 1,833 days, which earns the full maturity multiplier of 1.00, while the youngest rows earn close to the 0.60 floor.
Sixteen board rows are younger than 60 days, so their maturity multiplier is barely above the floor and their rank rests almost entirely on TVL and size.
The chain multiplier is `1 + 0.02 x min(chains - 1, 10)`, which adds two percent per extra chain up to a maximum of 1.20 for eleven or more chains.
One hundred and three of the 178 rows run on a single chain and earn no chain bonus at all, which makes chain breadth a real separator rather than a default.
Steer Protocol runs on 45 chains, the most on the board, but its chain multiplier is still capped at 1.20, the same as any protocol on eleven chains.
The snapshot behind all of this carries 758 protocols, of which 144 record a live token and 614 record none, and it was fetched from DefiLlama on 2026-11-14 at 01:18:33 UTC.
The board keeps only rankable pre-token protocols: it drops every protocol with a live token, every wrapped or staked product, and every bridge or liquid-staking category.
The board holds 178 rows in total: the 40 watchlist protocols plus 138 further rankable pre-token protocols below the $50M TVL floor.
The board spans 30 categories, and its implied values run from $85,394,071 for the top row down to $1,916,646 for the last row, a range of about forty-five to one.
The worked example below uses the rank-1 row, Steakhouse Financial, and every figure in it comes straight from that row's recorded model fields in board.json.
Steakhouse Financial records $2,753,981,495 of TVL, the largest TVL of any pre-token protocol in the snapshot, and it sits in the Risk Curators category.
Steakhouse Financial's fitted multiple is 0.03272489082348203 from the size curve at its TVL, the lowest on the board's top ten, because the curve charges the biggest protocols the least per dollar of TVL.
Steakhouse Financial's seven-day TVL change is -2.1935%, which the growth term turns into a multiplier of 0.9890325, a small drag of just over one percent.
Steakhouse Financial was first listed 543 days before the snapshot date, so its maturity multiplier is 0.6 + 543 / 1095 x 0.4, which equals 0.7984.
Steakhouse Financial runs on 11 chains, so its chain multiplier is 1 + 0.02 x 10, which equals the maximum of 1.20.
Multiplying $2,753,981,495 by 0.03272489082348203, then by 0.9890325, then by 0.7984, then by 1.20 gives the recorded implied value of $85,394,071.
The board stores the growth multiplier rounded to three decimals as 0.989, so multiplying the displayed rounded factors gives $85,395,953, which is 0.002% above the recorded value.
The dashboard avoids that rounding gap entirely by recomputing each row from the full-precision factors stored in data.js, so the page and the board agree to the dollar.
The top ten rows by implied value, with their category, TVL and implied value, are listed below so the board can be checked without opening the JSON.
Rank 1 is Steakhouse Financial, Risk Curators, TVL $2,753,981,495, implied value $85,394,071, the only row above $80,000,000.
Rank 2 is Gauntlet, Risk Curators, TVL $1,577,685,462, implied value $66,366,372, with a seven-day change of +5.645% and 14 chains.
Rank 3 is Veda, Onchain Capital Allocator, TVL $1,563,415,482, implied value $64,083,969, with a seven-day change of -8.2898% and 13 chains.
Rank 4 is USDD, CDP, TVL $1,055,793,606, implied value $46,108,107, with a seven-day change of -2.8062% and 3 chains.
Rank 5 is Upshift, Onchain Capital Allocator, TVL $499,083,733, implied value $39,670,670, with a seven-day change of +8.3117% and 15 chains.
Rank 6 is Symbiotic, Collateral Markets, TVL $253,923,299, implied value $22,527,999, with a seven-day change of -12.0318% on a single chain.
Rank 7 is Nonce Capital, Risk Curators, TVL $513,783,671, implied value $22,429,822, listed only 45 days ago on 2 chains.
Rank 8 is OpenTrade, RWA, TVL $241,501,527, implied value $22,389,389, with a seven-day change of -1.642% and 708 days of age.
Rank 9 is OnRe, RWA, TVL $308,882,355, implied value $22,385,230, with a seven-day change of +0.1082% and 488 days of age.
Rank 10 is RockawayX, Risk Curators, TVL $292,506,628, implied value $22,301,030, with a seven-day change of -2.5459% and 233 days of age.
The last board row is Monarq with an implied value of $1,916,646, which shows how steeply the board falls from the billion-dollar TVL leaders to the long tail.
The dashboard also carries a separate live-token view with the top 24 live-token protocols by market cap, excluding CEX, so the judge can see what the comps actually look like.

## How farm plans are derived

Every board row carries a seven-step farm plan, and the plan is generated from the protocol's own category, TVL, age and chains, never written by hand for a single protocol.
Step 1 is always the same: use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, at a cost of under $3 of gas for the first transaction and about 5 minutes of setup.
Step 2 is the category action: the one on-chain move that counts as farming that kind of protocol, sized to the capital band and run on the protocol's first listed chain.
A lending or CDP protocol asks for a USDC supply or collateral deposit, while a DEX or yield protocol asks for liquidity in its main pool.
A bridge protocol asks for a USDC bridge through it, a staking protocol asks for a stake of the chain's staking asset, and a perpetuals or derivatives protocol asks for a USDC margin deposit with one small hedge.
A prediction-market protocol asks for one funded market position, a curator or allocator asks for a vault deposit, and a stablecoin protocol asks for a mint or deposit of its stable asset.
An RWA or basis-trading protocol asks for a mint of its yield asset, an insurance protocol asks for a cover purchase, and a governance protocol asks for a deposit plus a vote on one live proposal.
A payments protocol asks for one payment through it, a chain protocol asks for a bridge onto its chain plus one app interaction, and anything else falls back to a plain USDC deposit.
The capital for step 2 comes from the protocol's TVL in four bands, so a farmer never has to guess how much a position should be worth.
A protocol with $5,000,000,000 or more of TVL asks for $250 of capital, but no row on this board reaches that band, so the $250 band is untested by this snapshot.
A protocol with $1,000,000,000 or more of TVL asks for $150 of capital, and only 4 of the 178 rows sit in that band, including the top two rows.
A protocol with $100,000,000 or more of TVL asks for $100 of capital, and 23 of the 178 rows sit in that band.
A protocol below $100,000,000 of TVL asks for $50 of capital, and 151 of the 178 rows sit in that band, so most farm plans on this board cost $50 plus gas.
The gas estimate on the deposit step is about $8 on Ethereum mainnet and about $1 on any other first-listed chain, because the chain, not the deposit size, sets the price of a transaction; every gas figure in the plan is labelled an estimate.
Step 3 is the weekly action: make one qualifying move each week, such as a deposit, a borrow, a swap or a vote, at a cost of about $8 of gas a week on Ethereum and about $1 elsewhere, and 10 minutes of attention.
Curator and allocator vaults get a specific weekly action, checking the vault allocation and topping it up with a small deposit, while staking protocols restake their rewards instead.
Step 4 is the hold: keep the position open long enough that the activity is counted in more than one snapshot, with the length set by the protocol's age.
A protocol younger than 180 days asks for a 60-day hold, because a young protocol needs a longer qualifying window to prove the position is real.
A protocol between 180 and 364 days old asks for a 45-day hold, and a protocol 365 days or older asks for a 30-day hold, which is also the default when the age is unknown.
Forty-three board rows ask for a 60-day hold, 29 rows ask for a 45-day hold, and 106 rows ask for a 30-day hold, so most plans on this board are month-long.
The plan's net gas is the setup plus one weekly transaction for every week held: $6 for most non-Ethereum rows, $48 to $80 for Ethereum rows, so the whole plan's gas is stated up front instead of dripping out a week at a time.
During the hold the $50, $100 or $150 of capital stays in the position, which is the real cost of the farm: the money is locked, not spent, and it can be withdrawn afterwards.
Step 5 is the claim check: before withdrawing, open the protocol's own points or rewards page and claim only from the link it publishes, at no fee and in about 10 minutes.
The claim step never asks for a payment to claim, and any page that demands one is a scam, which is why the plan says to use only the protocol's own published link.
Step 6 is the farm log: write the wallet, the dates and every transaction in a log so the position can be repeated or unwound, at no cost and in about 5 minutes.
Step 7 says what the snapshot does not say: no points program, audit or lockup is recorded for the protocol, and its seven-day change is quoted or marked unknown, so the plan never pretends to know them.
The full plan for the rank-1 row, Steakhouse Financial, shows how the template fills in: a fresh wallet, then a $150 deposit into a Steakhouse Financial vault on Base.
Steakhouse Financial's weekly action is to check the vault allocation and top it up with a small deposit, at about $1 of gas a week and 10 minutes of attention.
Steakhouse Financial's hold is 30 days, because at 543 days old it clears the 365-day threshold for the shortest qualifying window.
Steakhouse Financial's claim step and farm-log step are the standard ones, so the whole plan costs $150 of locked capital, roughly $6 of gas in total, and about 45 minutes of active time plus the hold.
The plan deliberately says nothing about points multipliers, airdrop eligibility or expected rewards, because the snapshot records no points program for any protocol.
Every plan is a template filled from the row's own data, so two protocols in the same category with the same TVL band and age band get the same plan shape with different names.
The dashboard regenerates each plan in the page from the same row data, so the plan shown on screen always matches the plan stored in board.json.

## How the calls and the allocation plans are derived

Every row carries one call — farm, thin or skip — from a single stated rule on rank and seven-day growth, applied to every row alike.
Farm means the top half of the board and still growing on a reported figure; skip means the bottom half and shrinking by more than 5% in seven days, or with no growth figure at all; thin is everything else, a small position with no weekly actions.
On this board the rule gives 26 farm rows, 118 thin rows and 34 skip rows, and the dashboard shows the call on every row.
The three allocation profiles turn the same board into three plans, each with a stated budget, an order and a stop rule, and picks taken from the board by rank and call, never by name.
Small capital is $300: the top three farm rows at $100 each, Gauntlet, Upshift and OnRe, with 30 minutes a week and a $30 gas reserve.
Little time is $750: the top five farm or thin rows at $150 each, deposit-only with no weekly actions, at 60 minutes a week and a $40 gas reserve.
Large capital is $2,500: the top eight farm or thin rows at $300 each, spread across categories with at most two picks per category, at 90 minutes a week and a $100 gas reserve.
Every profile stops the same way: unwind a position if its protocol falls out of the top 40 or its seven-day TVL change drops below -15% at the next snapshot, and stop the whole profile if gas passes the reserve.

## Verification

Re-running the program must reproduce the board byte for byte, and the checks below are the ones that confirm the board, the watchlist and the offline dashboard are what they claim to be.
Run the program twice into two different output directories with the same snapshot, using `MAKEFUN_OUTPUT_DIR=out1 node main.ts --input <path-to>/snapshot.json` and then the same command with `out2`.
Compare the two runs with `diff -r out1 out2`, which must report no differences, and confirm with `sha256sum out1/board.json out2/board.json` that the two board files share one hash.
The expected output of each run is `board.json`, `data.js`, `dashboard/` with `index.html`, `app.css` and `app.js`, `screenshots/` and `dossier.json`, all under the output directory.
Count the board rows with `node -e 'console.log(JSON.parse(require("fs").readFileSync("board.json","utf8")).rows.length)'`, which must print 178.
Check the watchlist coverage with a script that loads the snapshot's 40 watchlist slugs and confirms every one of them appears in the board, which this build does.
Check the below-floor tail by counting board rows with TVL under $50,000,000, which must be 138, since the 40 watchlist rows are the only ones allowed above the floor.
Check the implied-value range by printing the first and last rows, which must be $85,394,071 for Steakhouse Financial and $1,916,646 for Monarq.
Check the size curve by reading `fit` out of data.js, which must show intercept 3.0247, slope -0.4777, 128 comps, a leave-one-out error of 0.6931 against a flat-median error of 0.7848, and multiples of 0.6673 at $5M, 0.2221 at $50M, 0.0739 at $500M and 0.0327 at $2.75B of TVL.
Check the calls by counting the board's verdicts, which must be 26 farm, 118 thin and 34 skip, and check the allocation profiles in data.js, which must be three profiles with budgets of $300, $750 and $2,500.
Recompute the rank-1 row by hand from its recorded model fields, as shown in the worked example above, and confirm the product matches the recorded $85,394,071 to within the rounding note.
Verify the offline render by searching the dashboard for external references with `grep -rn "https\?://" dashboard/`, which must return nothing, since the page loads no fonts, scripts or images from the network.
Open `dashboard/index.html` in a browser with networking disabled and confirm the board renders, the detail view opens for a protocol, and the filters narrow the board.
Confirm the three screenshots in `screenshots/` match the three views the dossier claims: the full board, one protocol detail view, and one filtered view, all at 1440x900.
Confirm the dossier by opening `dossier.json` and checking its schema is `makefun/dossier/v1` and that it carries exactly the three screenshots as images.
Confirm the live-token view by checking `live_size` in data.js, which must be 24, the top 24 live-token protocols by market cap excluding CEX.
Confirm the board is sorted by checking that every row's implied value is less than or equal to the row before it, which the program enforces when it builds the ranking.
Confirm no protocol name is special-cased by searching `lib/model.ts` for the top-ten names, which returns nothing, since the same function scores every row.
Confirm the exclusion rules by checking that no board row belongs to Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX categories.
Confirm the wrapped-name rule by checking that no board row name contains the words wrapped, staked or staking as a whole word.
The snapshot used for this build is dated 2026-11-14 and was fetched from DefiLlama at 01:18:33 UTC, so re-running against a newer snapshot is expected to change the numbers.
If any check above fails after a fresh snapshot, the board is stale rather than wrong, and the fix is to re-run the program rather than to edit board.json by hand.
Never edit board.json, data.js or dossier.json by hand: all three are generated outputs, and hand edits are overwritten on the next run and break the byte-for-byte reproducibility check.
The program needs Node 22 and nothing else, since it uses only the standard library, and it takes the snapshot path as its `--input` argument.
A run that writes different bytes on its second pass has a nondeterminism bug, and the first place to look is the sort order, which must be total and stable across runs.

## Limits and honest caveats

The snapshot is a record dated 2026-11-14, not a live feed, and every number in this repo describes that day, so a protocol that launched a token on 2026-11-15 would still appear pre-token here.
A protocol "records no token" only when the snapshot carries no market cap, CoinGecko id and symbol for it, which is a statement about the record, never a claim that the protocol has no token.
The snapshot carries 614 protocols with no token on record out of 758, so most of the market the snapshot tracks is pre-token by this definition, and the board ranks only the 178 that pass the filters.
An implied value is a model output, not a price, not a valuation and not a promise: it says what a launch would be worth if the protocol traded at the market-cap to TVL ratio the size curve fits for its TVL.
The size curve is fitted on 128 live-token protocols whose market-cap to TVL ratios span from 0.001 to over 400, so the line is a summary of a very noisy market, and one giant listing or delisting can move the slope and reprice the whole board with it.
The curve prices every row from TVL alone, so two protocols of the same size in different categories get the same multiple, and a category that the market loves or hates is invisible to the price until the comps prove it in the fit.
The clamp binds at both ends: the biggest rows sit near the 0.03 floor and the smallest near the 0.80 cap, which means the model deliberately refuses to pay the curve's full extrapolation for the most extreme sizes.
No part of this model predicts whether a token will launch, when it will launch, or whether a launch would actually clear at the implied value, and the board must not be read as a launch calendar.
Age is time since the protocol was first listed in DefiLlama, which is a rough proxy for maturity, not a measure of product quality, security or team strength.
The seven-day TVL change is a single short window, so a protocol that bridged a large deposit in or out last week can look like it is growing or shrinking faster than it really is.
TVL itself can be gamed or double-counted across protocols, and the model takes the snapshot's TVL figures at face value without any independent audit of them.
The wrapped and staked exclusion relies on protocol names containing the words wrapped, staked or staking, plus six excluded categories, so a renamed or miscategorised product could slip onto the board.
The farm plans are generic templates, not financial advice, and they assume the protocol's points program, if any, rewards the simple actions the plan describes, which the snapshot does not verify; the verdicts and the allocation profiles are triage rules on rank and growth, not predictions that any row will pay.
The gas figures in the farm plans are estimates in dollars at the time of writing, and actual gas depends on the chain, the congestion and the price of the native token when the transaction runs; the $8 Ethereum and $1 elsewhere bands are rough on purpose and are labelled as estimates everywhere they appear.
The capital bands are sized to the protocol's TVL, not to the farmer's means, and $50 of locked capital is still $50 at risk if the protocol is exploited or the position cannot be withdrawn.
The hold periods are guesses about what a future snapshot might reward, not rules published by any protocol, and no protocol has promised to reward the actions in these plans.
The live-token view shows the top 24 live-token protocols by market cap, which is a display choice, not a ranking, and it excludes CEX protocols entirely.
The dashboard renders without network access, which means it also cannot refresh itself, so every figure on the page is frozen at the snapshot date until the program is re-run.
This repo is a research dashboard for a bounty competition, not investment advice, and nothing in it should be read as a recommendation to deposit funds into any protocol.

## Files in this repo

`main.ts` (110 lines) is the entrypoint: it reads the snapshot, calls the model, writes the board, the dashboard data, the static dashboard and the dossier.
`lib/model.ts` (798 lines) holds the radar-3 model, the fitted size curve and its leave-one-out test, the board builder, the farm-plan generator, the verdicts, the allocation profiles and the live-token view.
`vendor/makefun-board.ts` (373 lines) is the make.fun dossier library, copied byte for byte from the competition kit, and it must not be edited.
`board.json` (354,731 bytes) is the ranked board: 178 rows, each with rank, slug, name, category, chains, TVL, seven-day change, age, implied value, model factors, verdict, net gas cost and farm steps.
`data.js` (79,602 bytes) is the same board in compact form for the dashboard, plus the fitted size curve, the 128 live-token comps the page fits the curve from, the three allocation profiles and the 24 live-token rows.
`dossier.json` (837,217 bytes) is the summary the judge reads, built by `vendor/makefun-board.ts` from the dashboard files and the three screenshots, under schema `makefun/dossier/v1`.
`dashboard/index.html` (16 lines) is the static page shell that loads the stylesheet, the script and the board data, and renders the board, the detail view and the filters.
`dashboard/app.css` (168 lines) is the dashboard theme: one dark palette, two radii, two font families, and the layout for the decision panel, the board, the allocation cards, the detail panels and the filter controls.
`dashboard/app.js` (643 lines) is the dashboard logic: it fits the size curve itself from the 128 comps, recomputes every row from the fitted line, renders the decision panel, the board, the allocation plans and the detail views, and applies the filters.
`screenshots/1-board.png` (189,807 bytes) shows the decision panel and the head of the board at 1440x900, the first of the three views the dossier carries.
`dashboard/coverage.json` (3,829 bytes) is the coverage manifest the program writes beside the page: every watchlist slug, every board slug and the counts, so the dossier's text carries the proof the board covers the watchlist.
`screenshots/2-detail.png` (254,960 bytes) shows a protocol detail view at 1440x900, with the row's figures, model factors, evidence and farm plan.
`screenshots/3-filtered.png` (139,970 bytes) shows a filtered board view at 1440x900, with the board narrowed by the dashboard's filters.
`LICENSE` (23 lines) is the MIT license for this repo, copied from the competition kit's starter template.
`.makefun/owner.json` names the owner's wallet, `4QaSnRtzRTGn3Xs37rzS6pmhevrXA22vzhhHfHQreiFv`, and is the claim file that ties this entry to the @wedspierre account.
`README.md` is this file: the entry description, the model, the farm plans, the verification steps, the caveats and this file list.
The repo contains no build step, no dependencies and no network calls at runtime, so cloning it and running `node main.ts` is the whole setup.

## Reading the board

The board is sorted by implied value from rank 1 to rank 178, and the top ten rows alone account for $413,656,659 of the $1,496,817,530 total implied value, which is 27.6% of the whole board.
Thirty-four rows carry an implied value of $10,000,000 or more, and all 178 rows clear $1,000,000, so the long tail is thin but not worthless.
The median board row is worth $5,143,844 of implied value, which is a better sense of a typical pre-token protocol than the $85,394,071 top row.
The growth clamp is not theoretical: Shift DeFi grew 4,448.4747% in seven days, and the clamp holds its growth multiplier at the 1.60 ceiling instead of letting it run to 23.24.
Anemoy Capital fell 72.7093% in seven days, and the clamp holds its growth multiplier at the 0.70 floor instead of letting it drop to 0.64.
Ten rows sit at the maturity cap with 1,095 days or more of age, and thirteen rows sit at the chain cap with eleven or more chains, so both caps bind on real rows.
The filters narrow the board by category, by chain, by minimum TVL and by search text, and the detail view for a protocol shows its TVL, seven-day change, age, chains, model factors and farm plan.
The live-token view is the control group: it shows the 24 largest live-token protocols by market cap, so a reader can see the market the multiples were taken from.
A reader who wants the strongest candidates should start at the decision panel, then check the fitted multiple behind each row, because a rank built on the curve's floor is a weaker claim than one built on the curve's middle.
A reader who wants the cheapest farms should sort by capital band instead, since 151 of the 178 plans cost $50 plus gas and only 4 cost $150, and should check the call, since only 26 rows earn a farm call.
The board answers one question, which protocols without a token would be worth the most if they launched at the market price the size curve fits for their size, and it answers nothing else.
Any protocol that is missing from the board is missing for a reason: it has a live token, it is a wrapped or staked product, it sits in an excluded category, or it failed the rankable checks in the model.
The board is a snapshot of 2026-11-14, and the honest way to use it is to re-run the program against a fresh snapshot and watch which rows move, rather than to treat these ranks as permanent.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ta01qs0h&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
