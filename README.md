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

## How the value model works

The board is priced from the market, not from an opinion: every implied value starts from the protocol's own TVL and is multiplied by four factors that the program derives from the snapshot alone, so a new snapshot reprices the whole board without any code change.
The formula is `implied = round(tvl_usd x category_multiple x growth_multiplier x maturity_multiplier x chain_multiplier)`, and each of the four multipliers is defined below with the numbers this snapshot actually produced.
The category multiple is the median market-cap / TVL ratio of the live-token protocols in the same category, using only protocols that carry a market cap, a CoinGecko id and a symbol in the snapshot.
A category needs at least three live-token comps to earn its own multiple, and the multiple is clamped to the band 0.08–0.60 so that one outlier category cannot set the board on its own.
The global multiple is the median market-cap / TVL ratio across all 128 live-token protocols that pass the model's filter, and it is the fallback for every category with fewer than three comps.
This snapshot's global multiple is 0.2138, the average of the two middle ratios in the sorted list, stUSDT at 0.2049 and Superfluid at 0.2227, because the 128 comps make an even-length list.
Four categories hit the 0.60 cap, which means the market already prices their live-token peers above the band the model is willing to pay for a launch.
Basis Trading is priced at the 0.6000 cap from 7 live-token comps, because its raw median sits above the band and the clamp pulls it back down to 0.60.
Canonical Bridge is priced at the 0.6000 cap from 8 live-token comps, so its board rows are priced at the cap rather than at the raw median.
Cross Chain Bridge is priced at the 0.6000 cap from 4 live-token comps, again capped, because bridge tokens trade far above their TVL.
Privacy is priced at the 0.6000 cap from 3 live-token comps, the smallest comp set that still earns its own multiple.
Bridge uses a multiple of 0.5567 from 6 live-token comps, the highest uncapped multiple in the whole snapshot and the only one above 0.50.
Dexs use a multiple of 0.3424 from 11 live-token comps, the second-highest uncapped multiple in the snapshot after Bridge.
RWA uses a multiple of 0.2748 from 9 live-token comps, pricing tokenless real-world-asset protocols at roughly a quarter of their TVL.
Yield uses a multiple of 0.1914 from 9 live-token comps, sitting just below the global multiple of 0.2138.
CDP uses a multiple of 0.1687 from 3 live-token comps, the minimum comp set, so one new listing could move it.
Yield Aggregator uses a multiple of 0.1510 from 4 live-token comps, pricing aggregators below the market median.
Indexes use a multiple of 0.1477 from 3 live-token comps, again the minimum comp set for a category multiple.
Lending uses a multiple of 0.1324 from 15 live-token comps, the largest comp set in the snapshot and therefore the most stable multiple on the board.
CEX uses a multiple of 0.0800 from 9 live-token comps, floored at the bottom of the band because exchange tokens trade far below their TVL.
Liquid Staking uses a multiple of 0.0800 from 9 live-token comps, also floored, because liquid-staking tokens are priced against the staked asset rather than the protocol.
Twenty categories have fewer than three live-token comps, so every protocol in them is priced at the global multiple of 0.2138 instead of a category price.
Eighty-nine of the 178 board rows use the global fallback multiple, and the other 89 use their own category multiple, so exactly half the board is priced at the market median.
Risk Curators is the largest board category with 33 rows, and all 33 use the global fallback because the snapshot carries only one live-token Risk Curator, Api3, whose ratio is 2.9747.
Onchain Capital Allocator contributes 14 rows and also uses the global fallback, since its live-token comps fall below the three-comp threshold in this snapshot.
Derivatives contributes 10 rows at the global fallback, Chain contributes 4, Staking Pool 3, Liquidity Manager 3, and the remaining fallback rows are spread across 14 smaller categories with one or two rows each.
The eight categories with their own multiple on the board are Dexs, RWA, Yield, Lending, CDP, Yield Aggregator, Basis Trading and Indexes, and together they account for 89 rows.
The growth multiplier is `1 + clamp(change_7d, -60, 120) / 100 x 0.5`, so a protocol that grew 20% in seven days gets a 1.10 multiplier while one that fell 20% gets 0.90.
The seven-day change is clamped to the range -60% to +120% before it is weighted, which stops a single explosive week from dominating a protocol's rank.
Only 49 of the 178 board rows grew over the last seven days, so the growth term is a small drag on most of the board rather than a boost.
The maturity multiplier is `0.6 + min(age_days, 1095) / 1095 x 0.4`, which rewards protocols that have run longer without a token while capping the reward at three years of age.
Age is counted in whole days from the protocol's first-listed date in the snapshot to the snapshot date of 2026-11-14, and a missing listed date defaults to 365 days.
The oldest board row is Katana DEX at 1,833 days, which earns the full maturity multiplier of 1.00, while the youngest rows earn close to the 0.60 floor.
Sixteen board rows are younger than 60 days, so their maturity multiplier is barely above the floor and their rank rests almost entirely on TVL and category.
The chain multiplier is `1 + 0.02 x min(chains - 1, 10)`, which adds two percent per extra chain up to a maximum of 1.20 for eleven or more chains.
One hundred and three of the 178 rows run on a single chain and earn no chain bonus at all, which makes chain breadth a real separator rather than a default.
Steer Protocol runs on 45 chains, the most on the board, but its chain multiplier is still capped at 1.20, the same as any protocol on eleven chains.
The snapshot behind all of this carries 758 protocols, of which 144 record a live token and 614 record none, and it was fetched from DefiLlama on 2026-11-14 at 01:18:33 UTC.
The board keeps only rankable pre-token protocols: it drops every protocol with a live token, every wrapped or staked product, and every bridge or liquid-staking category.
The board holds 178 rows in total: the 40 watchlist protocols plus 138 further rankable pre-token protocols below the $50M TVL floor.
The board spans 30 categories, and its implied values run from $557,909,595 for the top row down to $597,212 for the last row, a range of nearly a thousand to one.
The worked example below uses the rank-1 row, Steakhouse Financial, and every figure in it comes straight from that row's recorded model fields in board.json.
Steakhouse Financial records $2,753,981,495 of TVL, the largest TVL of any pre-token protocol in the snapshot, and it sits in the Risk Curators category.
Risk Curators has only one live-token comp, Api3, so the category earns no multiple of its own and Steakhouse Financial is priced at the global multiple of 0.21380325885644053.
Steakhouse Financial's seven-day TVL change is -2.1935%, which the growth term turns into a multiplier of 0.9890325, a small drag of just over one percent.
Steakhouse Financial was first listed 543 days before the snapshot date, so its maturity multiplier is 0.6 + 543 / 1095 x 0.4, which equals 0.7984.
Steakhouse Financial runs on 11 chains, so its chain multiplier is 1 + 0.02 x 10, which equals the maximum of 1.20.
Multiplying $2,753,981,495 by 0.21380325885644053, then by 0.9890325, then by 0.7984, then by 1.20 gives the recorded implied value of $557,909,595.
The board stores the growth multiplier rounded to three decimals as 0.989, so multiplying the displayed rounded factors gives $557,921,894, which is 0.002% above the recorded value.
The dashboard avoids that rounding gap entirely by recomputing each row from the full-precision factors stored in data.js, so the page and the board agree to the dollar.
The top ten rows by implied value, with their category, TVL and implied value, are listed below so the board can be checked without opening the JSON.
Rank 1 is Steakhouse Financial, Risk Curators, TVL $2,753,981,495, implied value $557,909,595, the only row above half a billion dollars.
Rank 2 is Gauntlet, Risk Curators, TVL $1,577,685,462, implied value $332,277,422, with a seven-day change of +5.645% and 14 chains.
Rank 3 is Veda, Onchain Capital Allocator, TVL $1,563,415,482, implied value $319,460,387, with a seven-day change of -8.2898% and 13 chains.
Rank 4 is USDD, CDP, TVL $1,055,793,606, implied value $150,347,953, with a seven-day change of -2.8062% and 3 chains.
Rank 5 is Upshift, Onchain Capital Allocator, TVL $499,083,733, implied value $114,611,489, with a seven-day change of +8.3117% and 15 chains.
Rank 6 is Bittensor dTAO, Dexs, TVL $376,026,255, implied value $77,272,598, listed only 56 days ago on a single chain.
Rank 7 is OnRe, RWA, TVL $308,882,355, implied value $66,090,736, with a seven-day change of +0.1082% and 488 days of age.
Rank 8 is Nonce Capital, Risk Curators, TVL $513,783,671, implied value $65,706,327, listed only 45 days ago on 2 chains.
Rank 9 is OpenTrade, RWA, TVL $241,501,527, implied value $58,771,160, with a seven-day change of -1.642% and 708 days of age.
Rank 10 is Plume Vaults, RWA, TVL $211,537,977, implied value $53,997,192, with a seven-day change of -3.081% and 749 days of age.
The last board row is Flying Tulip ftUSD with an implied value of $597,212, which shows how steeply the board falls from the billion-dollar TVL leaders to the long tail.
The dashboard also carries a separate live-token view with the top 24 live-token protocols by market cap, excluding CEX, so the judge can see what the comps actually look like.

## How farm plans are derived

Every board row carries a six-step farm plan, and the plan is generated from the protocol's own category, TVL, age and chains, never written by hand for a single protocol.
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
The gas estimate on the deposit step is about $8 when the capital is $150 or more, and about $4 for the $100 and $50 bands, because larger deposits are routed through more expensive vault entry points.
Step 3 is the weekly action: make one qualifying move each week, such as a deposit, a borrow, a swap or a vote, at a cost of about $2 of gas a week and 10 minutes of attention.
Curator and allocator vaults get a specific weekly action, checking the vault allocation and topping it up with a small deposit, while staking protocols restake their rewards instead.
Step 4 is the hold: keep the position open long enough that the activity is counted in more than one snapshot, with the length set by the protocol's age.
A protocol younger than 180 days asks for a 60-day hold, because a young protocol needs a longer qualifying window to prove the position is real.
A protocol between 180 and 364 days old asks for a 45-day hold, and a protocol 365 days or older asks for a 30-day hold, which is also the default when the age is unknown.
Forty-three board rows ask for a 60-day hold, 29 rows ask for a 45-day hold, and 106 rows ask for a 30-day hold, so most plans on this board are month-long.
During the hold the $50, $100 or $150 of capital stays in the position, which is the real cost of the farm: the money is locked, not spent, and it can be withdrawn afterwards.
Step 5 is the claim check: before withdrawing, open the protocol's own points or rewards page and claim only from the link it publishes, at no fee and in about 10 minutes.
The claim step never asks for a payment to claim, and any page that demands one is a scam, which is why the plan says to use only the protocol's own published link.
Step 6 is the farm log: write the wallet, the dates and every transaction in a log so the position can be repeated or unwound, at no cost and in about 5 minutes.
The full plan for the rank-1 row, Steakhouse Financial, shows how the template fills in: a fresh wallet, then a $150 deposit into a Steakhouse Financial vault on Base.
Steakhouse Financial's weekly action is to check the vault allocation and top it up with a small deposit, at about $2 of gas a week and 10 minutes of attention.
Steakhouse Financial's hold is 30 days, because at 543 days old it clears the 365-day threshold for the shortest qualifying window.
Steakhouse Financial's claim step and farm-log step are the standard ones, so the whole plan costs $150 of locked capital, roughly $11 of one-time gas, about $2 of gas a week during the hold, and about 45 minutes of active time plus the hold.
The plan deliberately says nothing about points multipliers, airdrop eligibility or expected rewards, because the snapshot records no points program for any protocol.
Every plan is a template filled from the row's own data, so two protocols in the same category with the same TVL band and age band get the same plan shape with different names.
The dashboard regenerates each plan in the page from the same row data, so the plan shown on screen always matches the plan stored in board.json.

## Verification

Re-running the program must reproduce the board byte for byte, and the checks below are the ones that confirm the board, the watchlist and the offline dashboard are what they claim to be.
Run the program twice into two different output directories with the same snapshot, using `MAKEFUN_OUTPUT_DIR=out1 node main.ts --input <path-to>/snapshot.json` and then the same command with `out2`.
Compare the two runs with `diff -r out1 out2`, which must report no differences, and confirm with `sha256sum out1/board.json out2/board.json` that the two board files share one hash.
The expected output of each run is `board.json`, `data.js`, `dashboard/` with `index.html`, `app.css` and `app.js`, `screenshots/` and `dossier.json`, all under the output directory.
Count the board rows with `node -e 'console.log(JSON.parse(require("fs").readFileSync("board.json","utf8")).rows.length)'`, which must print 178.
Check the watchlist coverage with a script that loads the snapshot's 40 watchlist slugs and confirms every one of them appears in the board, which this build does.
Check the below-floor tail by counting board rows with TVL under $50,000,000, which must be 138, since the 40 watchlist rows are the only ones allowed above the floor.
Check the implied-value range by printing the first and last rows, which must be $557,909,595 for Steakhouse Financial and $597,212 for Flying Tulip ftUSD.
Check the global multiple by reading `global_multiple` out of data.js, which must be 0.21380325885644053, the average of the two middle live-token ratios.
Check the category comps by reading the `comps` array out of data.js, which must list 14 categories with at least three comps each and multiples between 0.08 and 0.60.
Recompute the rank-1 row by hand from its recorded model fields, as shown in the worked example above, and confirm the product matches the recorded $557,909,595 to within the rounding note.
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
An implied value is a model output, not a price, not a valuation and not a promise: it says what a launch would be worth if the protocol traded at its category's median market-cap to TVL ratio.
The category multiple is a median of other protocols, so a category with three comps can move sharply when one comp lists, delists or reprices, and the board would move with it.
Eighty-nine rows are priced at the global multiple rather than a category multiple, so their implied values say more about the whole market than about their own kind of protocol.
Four categories are priced at the 0.60 cap and two at the 0.08 floor, which means the model deliberately refuses to pay the market's full price for the most extreme categories.
No part of this model predicts whether a token will launch, when it will launch, or whether a launch would actually clear at the implied value, and the board must not be read as a launch calendar.
Age is time since the protocol was first listed in DefiLlama, which is a rough proxy for maturity, not a measure of product quality, security or team strength.
The seven-day TVL change is a single short window, so a protocol that bridged a large deposit in or out last week can look like it is growing or shrinking faster than it really is.
TVL itself can be gamed or double-counted across protocols, and the model takes the snapshot's TVL figures at face value without any independent audit of them.
The wrapped and staked exclusion relies on protocol names containing the words wrapped, staked or staking, plus six excluded categories, so a renamed or miscategorised product could slip onto the board.
The farm plans are generic templates, not financial advice, and they assume the protocol's points program, if any, rewards the simple actions the plan describes, which the snapshot does not verify.
The gas figures in the farm plans are estimates in dollars at the time of writing, and actual gas depends on the chain, the congestion and the price of the native token when the transaction runs.
The capital bands are sized to the protocol's TVL, not to the farmer's means, and $50 of locked capital is still $50 at risk if the protocol is exploited or the position cannot be withdrawn.
The hold periods are guesses about what a future snapshot might reward, not rules published by any protocol, and no protocol has promised to reward the actions in these plans.
The live-token view shows the top 24 live-token protocols by market cap, which is a display choice, not a ranking, and it excludes CEX protocols entirely.
The dashboard renders without network access, which means it also cannot refresh itself, so every figure on the page is frozen at the snapshot date until the program is re-run.
This repo is a research dashboard for a bounty competition, not investment advice, and nothing in it should be read as a recommendation to deposit funds into any protocol.

## Files in this repo

`main.ts` (96 lines) is the entrypoint: it reads the snapshot, calls the model, writes the board, the dashboard data, the static dashboard and the dossier.
`lib/model.ts` (590 lines) holds the radar-2 model, the category multiples, the board builder, the farm-plan generator and the live-token view.
`vendor/makefun-board.ts` (373 lines) is the make.fun dossier library, copied byte for byte from the competition kit, and it must not be edited.
`board.json` (256,147 bytes) is the ranked board: 178 rows, each with rank, slug, name, category, chains, TVL, seven-day change, age, implied value, model factors and farm steps.
`data.js` (70,214 bytes) is the same board in compact form for the dashboard, plus the global multiple, the category comps and the 24 live-token rows.
`dossier.json` (722,746 bytes) is the summary the judge reads, built by `vendor/makefun-board.ts` from the dashboard files and the three screenshots, under schema `makefun/dossier/v1`.
`dashboard/index.html` (16 lines) is the static page shell that loads the stylesheet, the script and the board data, and renders the board, the detail view and the filters.
`dashboard/app.css` (146 lines) is the dashboard theme: one dark palette, two radii, two font families, and the layout for the board, the detail panels and the filter controls.
`dashboard/app.js` (442 lines) is the dashboard logic: it recomputes every row from the full-precision factors, renders the board and detail views, and applies the filters.
`screenshots/1-board.png` (149,189 bytes) shows the full board view at 1440x900, the first of the three views the dossier carries.
`screenshots/2-detail.png` (211,355 bytes) shows a protocol detail view at 1440x900, with the row's figures, model factors and farm plan.
`screenshots/3-filtered.png` (152,885 bytes) shows a filtered board view at 1440x900, with the board narrowed by the dashboard's filters.
`LICENSE` (23 lines) is the MIT license for this repo, copied from the competition kit's starter template.
`.makefun/owner.json` names the owner's wallet, `4QaSnRtzRTGn3Xs37rzS6pmhevrXA22vzhhHfHQreiFv`, and is the claim file that ties this entry to the @wedspierre account.
`README.md` is this file: the entry description, the model, the farm plans, the verification steps, the caveats and this file list.
The repo contains no build step, no dependencies and no network calls at runtime, so cloning it and running `node main.ts` is the whole setup.

## Reading the board

The board is sorted by implied value from rank 1 to rank 178, and the top ten rows alone account for $1,796,444,859 of the $2,941,422,245 total implied value, which is 61.1% of the whole board.
Forty rows carry an implied value of $10,000,000 or more, and 164 of the 178 rows clear $1,000,000, so the long tail is thin but not worthless.
The median board row is worth $3,371,428 of implied value, which is a better sense of a typical pre-token protocol than the $557,909,595 top row.
The growth clamp is not theoretical: Shift DeFi grew 4,448.4747% in seven days, and the clamp holds its growth multiplier at the 1.60 ceiling instead of letting it run to 23.24.
Anemoy Capital fell 72.7093% in seven days, and the clamp holds its growth multiplier at the 0.70 floor instead of letting it drop to 0.64.
Ten rows sit at the maturity cap with 1,095 days or more of age, and thirteen rows sit at the chain cap with eleven or more chains, so both caps bind on real rows.
The filters narrow the board by category, by chain, by minimum TVL and by search text, and the detail view for a protocol shows its TVL, seven-day change, age, chains, model factors and farm plan.
The live-token view is the control group: it shows the 24 largest live-token protocols by market cap, so a reader can see the market the multiples were taken from.
A reader who wants the strongest candidates should start at the top of the board, then check the category multiple behind each row, because a rank built on the global fallback is a weaker claim than one built on a category multiple.
A reader who wants the cheapest farms should sort by capital band instead, since 151 of the 178 plans cost $50 plus gas and only 4 cost $150.
The board answers one question, which protocols without a token would be worth the most if they launched at their category's market price, and it answers nothing else.
Any protocol that is missing from the board is missing for a reason: it has a live token, it is a wrapped or staked product, it sits in an excluded category, or it failed the rankable checks in the model.
The board is a snapshot of 2026-11-14, and the honest way to use it is to re-run the program against a fresh snapshot and watch which rows move, rather than to treat these ranks as permanent.
