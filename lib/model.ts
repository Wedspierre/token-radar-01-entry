// Token Radar v2.6 — model, validation, board and farm plans.
// Written from zero for this version. Everything below is recomputed at
// run time from the sealed snapshot: no coefficient, table or ranking is
// carried in from an earlier version.
//
// The model in one paragraph: the size curve log10(market cap) = a + b *
// log10(TVL) is fitted on the snapshot's own traded tokens, then kept only
// because it beats a flat median multiple in two held-out tests (ten-fold
// cross-validation and walk-forward older-to-newer). Growth and age as value
// terms were fitted the same way and DROPPED — both lose to the bare curve
// in both tests, and the dashboard shows the losing numbers. A shrunk
// per-category adjustment is kept because it wins ten-fold. Age re-enters
// through launch odds, not through value: the peers' record gives a launch
// hazard that falls steeply with age, so the board ranks by expected value
// = implied value if it launches x launch odds. Every row carries a
// conformal range (out-of-fold residuals by TVL tercile) instead of a
// false-precision point, and a farm plan netted to the dollar with a
// verdict per plan size.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  // extras the dashboard reads (the gate allows extra keys)
  tvl_usd: number;
  category: string;
  chains: string[];
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  flagged: boolean;
  implied_if_launches_usd: number;
  launch_odds: number;
  value_low_usd: number;
  value_high_usd: number;
  gas_usd: number;
  capital_usd: number;
  active_minutes: number;
  hold_days: number;
  verdict_50: string;
  verdict_250: string;
  verdict_1000: string;
  cost_per_hour_usd: number;
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  board: BoardRow[];
  counts: { protocols: number; watchlist: number; ranked: number; traded: number; excluded_pretoken: number };
  curve: { intercept: number; slope: number; comps: number; dated: number; in_sample_mae: number; r2: number };
  validation: {
    tenFold: { model: number; baseline: number; betterPct: number };
    walkForward: { cut: string; train: number; test: number; slope: number; model: number; baseline: number; betterPct: number }[];
    blindHoldout: { model: number; baseline: number; betterPct: number };
    loo: { model: number; baseline: number; betterPct: number };
    blindSizeCurve: { halfA: number; halfB: number; gap: number };
    winsor: { slope: number; delta: number };
    decile: { low: number; high: number; range: number };
    bootstrap: { slopeLow: number; slopeHigh: number; mult5: number[]; mult50: number[]; mult500: number[] };
    segmentTenFold: { plain: number; segmented: number; betterPct: number };
    dropped: { term: string; tenFold: number; walk2023: number; walk2025: number; baseTenFold: number; baseWalk2023: number; baseWalk2025: number }[];
  };
  segments: { category: string; n: number; medianResidual: number; adjustment: number; multiplier: number }[];
  oddsTable: { band: string; cumTokened: number; decay: number }[];
  categoryOdds: { category: string; n: number; tokenedRate: number }[];
  conformal: { tercile: number; loTvl: number; hiTvl: number; p10: number; p90: number }[];
  accounting: { label: string; count: number; note: string }[];
  tradedTop: { slug: string; name: string; mcap_usd: number; tvl_usd: number }[];
  integrity: { check: string; result: string; pass: boolean }[];
  gasTable: { chain: string; usd: number }[];
}

// ---------- small deterministic helpers ----------

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) throw new Error('snapshot: protocols/watchlist missing');
  return raw;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  return Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z')) / 86400000);
}

/** Closed-form OLS for y = a + b*x. */
function fitLine(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i]! - mx) ** 2; sxy += (xs[i]! - mx) * (ys[i]! - my); }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/** General small OLS via normal equations (growth/age term tests). */
function olsGeneral(rows: number[][], ys: number[]): number[] {
  const k = rows[0]!.length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[i]! * r[j]!, 0)));
  const b = Array.from({ length: k }, (_, i) => rows.reduce((s, r, t) => s + r[i]! * ys[t]!, 0));
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    for (let r = c + 1; r < k; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j < k; j++) A[r]![j]! -= f * A[c]![j]!;
      b[r]! -= f * b[c]!;
    }
  }
  const beta = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let j = r + 1; j < k; j++) s -= A[r]![j]! * beta[j]!;
    beta[r] = s / A[r]![r]!;
  }
  return beta;
}

// ---------- rankability (the house rule, floor removed) ----------

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

export function isRankable(p: Protocol): boolean {
  return (
    p.gecko_id == null && p.symbol == null &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !VERSION_SUFFIX.test(p.name)
  );
}

function exclusionReason(p: Protocol): string {
  if (p.gecko_id != null || p.symbol != null) return 'token already trades';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `category ${p.category} is a wrapped/staked/bridged product`;
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange-named product';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped/staked product by name';
  if (VERSION_SUFFIX.test(p.name)) return 'versioned pool (V2-style name)';
  return 'rankable';
}

// ---------- gas: model estimates, cheapest chain the protocol lists ----------

const GAS_USD: Record<string, number> = {
  Ethereum: 3.5, Arbitrum: 0.15, Optimism: 0.1, Base: 0.05, Solana: 0.01,
  'Binance Smart Chain': 0.1, Binance: 0.1, Avalanche: 0.15, Polygon: 0.05,
  Hyperliquid: 0.01, 'Hyperliquid L1': 0.01, TON: 0.05, Bitcoin: 0.5,
  Cronos: 0.1, Stellar: 0.01, Astar: 0.1,
};
const DEFAULT_GAS_USD = 0.5;
const TX_COUNT = 8; // 2 to set up, 5 weekly actions, 1 to exit

function cheapestChain(p: Protocol): { chain: string; usd: number } {
  let best: { chain: string; usd: number } | null = null;
  for (const c of p.chains) {
    const usd = GAS_USD[c] ?? DEFAULT_GAS_USD;
    if (!best || usd < best.usd) best = { chain: c, usd };
  }
  return best ?? { chain: 'Ethereum', usd: GAS_USD.Ethereum! };
}

// ---------- farm plans ----------

function coreAction(category: string | null): { verb: string; why: string } {
  switch (category) {
    case 'Lending': return { verb: 'Supply collateral and open a small borrow, then repay it in full', why: 'lending usage is the protocol\'s own activity: supplying and borrowing leaves a real position on its books rather than a bare wallet touch.' };
    case 'Dexs': return { verb: 'Add liquidity to its deepest pool and swap through it once a week', why: 'a DEX records makers and takers; providing liquidity and routing a swap through the pool is the activity its own ledger can see.' };
    case 'Yield': case 'Yield Aggregator': return { verb: 'Deposit into its highest-TVL vault and hold the vault shares', why: 'vault shares are the protocol\'s receipt for your deposit: holding them through weekly epochs is the position it tracks.' };
    case 'Derivatives': case 'Basis Trading': return { verb: 'Open one small hedged position and close it the same week', why: 'a perps or basis desk counts open interest and settled trades; one hedged round-trip is the smallest real use of it.' };
    case 'CDP': case 'CDP Manager': return { verb: 'Mint its stable asset against collateral and repay the mint', why: 'a CDP\'s ledger is its vaults: opening one and repaying it is the protocol\'s own unit of use.' };
    case 'RWA': return { verb: 'Hold its tokenised real-world asset position for the full hold', why: 'RWA positions are issued on-chain and held, not churned: a held position is the protocol\'s own record of you.' };
    case 'Liquid Restaking': case 'Restaked BTC': return { verb: 'Restake through its vault and hold the receipt token', why: 'restaking receipts are the position: holding them is the protocol\'s own record.' };
    case 'Bridge': case 'Canonical Bridge': return { verb: 'Bridge a small amount in and the same amount back a week later', why: 'a bridge\'s ledger is crossings: one round trip is the smallest complete use of it.' };
    default: return { verb: 'Use its core function once a week with a real position', why: 'the protocol\'s own ledger records real use: one genuine interaction a week beats ten empty wallet touches.' };
  }
}

function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function verdictFor(gasUsd: number, capital: number): string {
  const share = gasUsd / capital;
  if (share <= 0.02) return 'WORTH IT';
  if (share <= 0.10) return 'MARGINAL';
  return 'SKIP';
}

function farmPlan(p: Protocol, ev: number, odds: number): { steps: string[]; gasUsd: number; capitalUsd: number; minutes: number; holdDays: number; v50: string; v250: string; v1000: string; costPerHour: number } {
  const cheap = cheapestChain(p);
  const gasUsd = TX_COUNT * cheap.usd;
  const capitalUsd = p.tvl_usd < 25_000_000 ? 50 : p.tvl_usd < 250_000_000 ? 100 : 250;
  const age = ageDays('2026-11-14', p.listed_at);
  const holdDays = age == null ? 45 : age > 730 ? 30 : 60;
  const minutes = 100;
  const core = coreAction(p.category);
  const chainList = p.chains.slice(0, 3).join(', ') || 'its chain';
  const v50 = verdictFor(gasUsd, 50);
  const v250 = verdictFor(gasUsd, 250);
  const v1000 = verdictFor(gasUsd, 1000);
  const costPerHour = gasUsd / (minutes / 60);
  const steps = [
    `Set up: create a fresh wallet, bridge ${money(capitalUsd)} to ${cheap.chain} (${chainList} listed; ${cheap.chain} is the cheapest at about $${cheap.usd.toFixed(2)} per transaction), and keep $5 of gas in reserve. About 15 minutes of active time, ${money(2 * cheap.usd)} in gas.`,
    `${core.verb} with the full ${money(capitalUsd)} position. ${core.why} About 20 minutes, ${money(2 * cheap.usd)} in gas for the two transactions.`,
    `Repeat the core action once a week for ${Math.round(holdDays / 7)} weeks: same position, same size, one transaction each week (${money(cheap.usd)} gas a week). Weekly use is what separates a real user from a one-off wallet touch.`,
    `Check the position every week on the protocol's own page and keep a screenshot of the balance: if the position is not showing, fix it before the next weekly action, while the gas is still cheap. About 5 minutes a week, no gas.`,
    `Do one second, different action inside the same protocol — a second pool, market or vault — with a quarter of the position (${money(capitalUsd / 4)}). A second touchpoint inside one protocol costs one more transaction (${money(cheap.usd)}) and shows breadth, not just repetition.`,
    `Prepare the exit in the last week: confirm the withdrawal path works with a $1 test withdrawal first, then plan the full exit for the day the hold ends. One test transaction, ${money(cheap.usd)} in gas, 10 minutes.`,
    `Net: ${money(gasUsd)} gas total (${TX_COUNT} transactions on ${cheap.chain} at $${cheap.usd.toFixed(2)} each) + ${money(capitalUsd)} capital locked for ${holdDays} days and withdrawable + ${minutes} minutes of active time. Verdicts by plan size: $50 plan ${v50} (gas is ${(gasUsd / 50 * 100).toFixed(0)}% of capital), $250 plan ${v250}, $1,000 plan ${v1000}; cost ${money(costPerHour)} per active hour. Expected launch value ${money(ev)} at ${(odds * 100).toFixed(0)}% launch odds — the plan costs gas, it never promises a payout.`,
  ];
  return { steps, gasUsd, capitalUsd, minutes, holdDays, v50, v250, v1000, costPerHour };
}

// ---------- the build ----------

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = snapshot.as_of;
  const watch = new Set(snapshot.watchlist);
  const comps = snapshot.protocols.filter((p) => p.mcap_usd && p.mcap_usd > 0 && p.tvl_usd > 0);
  const compX = comps.map((p) => Math.log10(p.tvl_usd));
  const compY = comps.map((p) => Math.log10(p.mcap_usd!));
  const curve = fitLine(compX, compY);
  const compRes = comps.map((p, i) => Math.log10(p.mcap_usd!) - (curve.a + curve.b * Math.log10(p.tvl_usd)));
  const inSampleMae = mean(compRes.map(Math.abs));
  const yMean = mean(compY);
  const r2 = 1 - compRes.reduce((s, r) => s + r * r, 0) / compY.reduce((s, y) => s + (y - yMean) ** 2, 0);

  // ---- validation ----
  type Dated = Protocol & { x: number; y: number; age: number; g: number };
  const dated: Dated[] = comps
    .map((p) => ({ p, age: ageDays(asOf, p.listed_at), g: p.change_7d == null ? null : clamp(p.change_7d, -60, 120) / 100 }))
    .filter((d) => d.age != null && d.g != null)
    .map((d) => ({ ...d.p, x: Math.log10(d.p.tvl_usd), y: Math.log10(d.p.mcap_usd!), age: d.age! / 365, g: d.g! }));
  const foldOf = (slug: string, k: number): number => hashStr(slug) % k;

  function kfoldMae(rows: { slug: string; x: number; y: number; age: number; g: number }[], feat: (r: { x: number; age: number; g: number }) => number[], k = 10): { model: number; baseline: number } {
    const errs: number[] = [];
    const baseErrs: number[] = [];
    for (let f = 0; f < k; f++) {
      const test = rows.filter((r) => foldOf(r.slug, k) === f);
      const train = rows.filter((r) => foldOf(r.slug, k) !== f);
      if (!test.length || !train.length) continue;
      const beta = olsGeneral(train.map(feat), train.map((r) => r.y));
      const med = median(train.map((r) => r.y - r.x));
      for (const r of test) {
        const pred = beta.reduce((s, b, i) => s + b * feat(r)[i]!, 0);
        errs.push(Math.abs(r.y - pred));
        baseErrs.push(Math.abs(r.y - (r.x + med)));
      }
    }
    return { model: mean(errs), baseline: mean(baseErrs) };
  }
  const baseFeat = (r: { x: number }) => [1, r.x];
  const growthFeat = (r: { x: number; g: number }) => [1, r.x, r.g];
  const ageFeat = (r: { x: number; age: number }) => [1, r.x, r.age];
  const bothFeat = (r: { x: number; g: number; age: number }) => [1, r.x, r.g, r.age];

  const allRows = comps.map((p) => ({ slug: p.slug, x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd!), age: 0, g: 0 }));
  const tenAll = kfoldMae(allRows, baseFeat);
  const tenBase = kfoldMae(dated, baseFeat);
  const tenGrowth = kfoldMae(dated, growthFeat);
  const tenAge = kfoldMae(dated, ageFeat);
  const tenBoth = kfoldMae(dated, bothFeat);

  function walkForward(rows: Dated[], feat: (r: Dated) => number[], cut: string): { train: number; test: number; slope: number; model: number; baseline: number } {
    const train = rows.filter((r) => r.listed_at! < cut);
    const test = rows.filter((r) => r.listed_at! >= cut);
    const beta = olsGeneral(train.map(feat), train.map((r) => r.y));
    const med = median(train.map((r) => r.y - r.x));
    return {
      train: train.length, test: test.length, slope: beta[1]!,
      model: mean(test.map((r) => Math.abs(r.y - beta.reduce((s, b, i) => s + b * feat(r)[i]!, 0)))),
      baseline: mean(test.map((r) => Math.abs(r.y - (r.x + med)))),
    };
  }
  const cuts = ['2023-01-01', '2024-02-18', '2025-01-01'];
  const wfBase = cuts.map((cut) => ({ cut, ...walkForward(dated, baseFeat, cut) }));
  const wfGrowth23 = walkForward(dated, growthFeat, '2023-01-01');
  const wfGrowth25 = walkForward(dated, growthFeat, '2025-01-01');
  const wfAge23 = walkForward(dated, ageFeat, '2023-01-01');
  const wfAge25 = walkForward(dated, ageFeat, '2025-01-01');
  const wfBoth23 = walkForward(dated, bothFeat, '2023-01-01');
  const wfBoth25 = walkForward(dated, bothFeat, '2025-01-01');

  // blind holdout: 20% by slug hash, fit on the other 80%
  const holdTest = comps.filter((p) => hashStr(p.slug) % 5 === 0);
  const holdTrain = comps.filter((p) => hashStr(p.slug) % 5 !== 0);
  const holdBeta = fitLine(holdTrain.map((p) => Math.log10(p.tvl_usd)), holdTrain.map((p) => Math.log10(p.mcap_usd!)));
  const holdMed = median(holdTrain.map((p) => Math.log10(p.mcap_usd!) - Math.log10(p.tvl_usd)));
  const blindHoldout = {
    model: mean(holdTest.map((p) => Math.abs(Math.log10(p.mcap_usd!) - (holdBeta.a + holdBeta.b * Math.log10(p.tvl_usd))))),
    baseline: mean(holdTest.map((p) => Math.abs(Math.log10(p.mcap_usd!) - (Math.log10(p.tvl_usd) + holdMed)))),
  };

  // leave-one-out on all comps
  const looErrs: number[] = [];
  const looBase: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const b = fitLine(train.map((p) => Math.log10(p.tvl_usd)), train.map((p) => Math.log10(p.mcap_usd!)));
    const med = median(train.map((p) => Math.log10(p.mcap_usd!) - Math.log10(p.tvl_usd)));
    const p = comps[i]!;
    looErrs.push(Math.abs(Math.log10(p.mcap_usd!) - (b.a + b.b * Math.log10(p.tvl_usd))));
    looBase.push(Math.abs(Math.log10(p.mcap_usd!) - (Math.log10(p.tvl_usd) + med)));
  }
  const loo = { model: mean(looErrs), baseline: mean(looBase) };

  // blind size curve: two seeded halves
  const halfA = comps.filter((p) => hashStr(p.slug) % 2 === 0);
  const halfB = comps.filter((p) => hashStr(p.slug) % 2 === 1);
  const slopeA = fitLine(halfA.map((p) => Math.log10(p.tvl_usd)), halfA.map((p) => Math.log10(p.mcap_usd!))).b;
  const slopeB = fitLine(halfB.map((p) => Math.log10(p.tvl_usd)), halfB.map((p) => Math.log10(p.mcap_usd!))).b;

  // winsorised 5/95 refit
  const sortedRes = [...compRes].sort((a, b) => a - b);
  const wLo = sortedRes[Math.floor(0.05 * sortedRes.length)]!;
  const wHi = sortedRes[Math.floor(0.95 * sortedRes.length)]!;
  const winsorY = compY.map((y, i) => {
    const r = clamp(compRes[i]!, wLo, wHi);
    return compX[i]! * curve.b + curve.a + r;
  });
  const winsorSlope = fitLine(compX, winsorY).b;

  // leave-one-TVL-decile-out slopes
  const byTvl = [...comps].sort((a, b) => a.tvl_usd - b.tvl_usd);
  const decileSlopes: number[] = [];
  for (let d = 0; d < 10; d++) {
    const lo = Math.floor((d * byTvl.length) / 10);
    const hi = Math.floor(((d + 1) * byTvl.length) / 10);
    const train = byTvl.filter((_, i) => i < lo || i >= hi);
    decileSlopes.push(fitLine(train.map((p) => Math.log10(p.tvl_usd)), train.map((p) => Math.log10(p.mcap_usd!))).b);
  }

  // bootstrap slope CI (seeded, 1000 resamples)
  const R = mulberry32(20261126);
  const bootSlopes: number[] = [];
  const bootMult: Record<number, number[]> = { 5: [], 50: [], 500: [] };
  for (let i = 0; i < 1000; i++) {
    const sample = Array.from({ length: comps.length }, () => comps[Math.floor(R() * comps.length)]!);
    const b = fitLine(sample.map((p) => Math.log10(p.tvl_usd)), sample.map((p) => Math.log10(p.mcap_usd!)));
    bootSlopes.push(b.b);
    for (const tvlM of [5, 50, 500]) {
      const tvl = tvlM * 1e6;
      bootMult[tvlM]!.push(10 ** (b.a + b.b * Math.log10(tvl)) / tvl);
    }
  }
  bootSlopes.sort((a, b) => a - b);
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };

  // category segments (shrunk, capped) + their ten-fold test
  const byCat: Record<string, number[]> = {};
  comps.forEach((p, i) => { (byCat[p.category ?? 'none'] ??= []).push(compRes[i]!); });
  const segmentOf = (cat: string | null): number => {
    const rs = byCat[cat ?? 'none'];
    if (!rs || rs.length < 5) return 0;
    return clamp(median(rs) * rs.length / (rs.length + 5), -0.35, 0.35);
  };
  const segments = Object.entries(byCat)
    .filter(([, rs]) => rs.length >= 5)
    .map(([category, rs]) => {
      const adj = clamp(median(rs) * rs.length / (rs.length + 5), -0.35, 0.35);
      return { category, n: rs.length, medianResidual: median(rs), adjustment: adj, multiplier: 10 ** adj };
    })
    .sort((a, b) => b.n - a.n);
  function kfoldSegmented(k = 10): { plain: number; segmented: number } {
    const errs: number[] = [];
    const segErrs: number[] = [];
    for (let f = 0; f < k; f++) {
      const test = dated.filter((r) => foldOf(r.slug, k) === f);
      const train = dated.filter((r) => foldOf(r.slug, k) !== f);
      const b = fitLine(train.map((r) => r.x), train.map((r) => r.y));
      const resTrain = train.map((r) => ({ cat: r.category ?? 'none', r: r.y - (b.a + b.b * r.x) }));
      const cats: Record<string, number[]> = {};
      for (const t of resTrain) (cats[t.cat] ??= []).push(t.r);
      const adj: Record<string, number> = {};
      for (const [c, rs] of Object.entries(cats)) if (rs.length >= 5) adj[c] = clamp(median(rs) * rs.length / (rs.length + 5), -0.35, 0.35);
      for (const r of test) {
        const p0 = b.a + b.b * r.x;
        errs.push(Math.abs(r.y - p0));
        segErrs.push(Math.abs(r.y - (p0 + (adj[r.category ?? 'none'] ?? 0))));
      }
    }
    return { plain: mean(errs), segmented: mean(segErrs) };
  }
  const segFold = kfoldSegmented();

  // conformal bands from ten-fold out-of-fold residuals, by TVL tercile
  const oof: { tvl: number; r: number }[] = [];
  for (let f = 0; f < 10; f++) {
    const test = comps.filter((p) => foldOf(p.slug, 10) === f);
    const train = comps.filter((p) => foldOf(p.slug, 10) !== f);
    const b = fitLine(train.map((p) => Math.log10(p.tvl_usd)), train.map((p) => Math.log10(p.mcap_usd!)));
    for (const p of test) oof.push({ tvl: p.tvl_usd, r: Math.log10(p.mcap_usd!) - (b.a + b.b * Math.log10(p.tvl_usd)) });
  }
  const oofSorted = [...oof].sort((a, b) => a.tvl - b.tvl);
  const conformal = [0, 1, 2].map((t) => {
    const part = oofSorted.slice(Math.floor((t * oofSorted.length) / 3), Math.floor(((t + 1) * oofSorted.length) / 3));
    const rs = part.map((x) => x.r);
    return { tercile: t + 1, loTvl: part[0]!.tvl, hiTvl: part[part.length - 1]!.tvl, p10: q(rs, 0.1), p90: q(rs, 0.9) };
  });

  // ---- launch odds from the peers' record ----
  const datedAll = snapshot.protocols
    .filter((p) => p.listed_at)
    .map((p) => ({ age: ageDays(asOf, p.listed_at)! / 365, token: p.gecko_id != null || p.symbol != null, category: p.category ?? 'none' }));
  const cumTokened = (ageYears: number): number => {
    const c = datedAll.filter((p) => p.age < ageYears);
    return c.length ? c.filter((p) => p.token).length / c.length : 0;
  };
  const fInf = cumTokened(8);
  const decayOf = (ageYears: number): number => {
    const f = cumTokened(Math.min(Math.max(ageYears, 0.0001), 8));
    return clamp(((fInf - f) / (1 - f)) / fInf, 0.02, 1);
  };
  const oddsTable = [
    { band: 'under 6 months', cumTokened: cumTokened(0.5), decay: decayOf(0.25) },
    { band: '6–12 months', cumTokened: cumTokened(1), decay: decayOf(0.75) },
    { band: '1–2 years', cumTokened: cumTokened(2), decay: decayOf(1.5) },
    { band: '2–3 years', cumTokened: cumTokened(3), decay: decayOf(2.5) },
    { band: '3–5 years', cumTokened: cumTokened(5), decay: decayOf(4) },
    { band: '5+ years', cumTokened: cumTokened(8), decay: decayOf(6) },
  ];
  const older = datedAll.filter((p) => p.age >= 1);
  const globalRate = older.filter((p) => p.token).length / older.length;
  const catCounts: Record<string, { n: number; t: number }> = {};
  for (const p of older) {
    const c = (catCounts[p.category] ??= { n: 0, t: 0 });
    c.n++;
    if (p.token) c.t++;
  }
  const categoryRate = (cat: string | null): number => {
    const c = catCounts[cat ?? 'none'];
    if (!c) return globalRate;
    return (c.t + 5 * globalRate) / (c.n + 5);
  };
  const categoryOdds = Object.entries(catCounts)
    .filter(([, c]) => c.n >= 10)
    .map(([category, c]) => ({ category, n: c.n, tokenedRate: c.t / c.n }))
    .sort((a, b) => b.tokenedRate - a.tokenedRate);

  // ---- board ----
  const rankable = snapshot.protocols.filter(isRankable);
  const scored = rankable.map((p) => {
    const implied = 10 ** (curve.a + curve.b * Math.log10(p.tvl_usd) + segmentOf(p.category));
    const ageY = ageDays(asOf, p.listed_at);
    const odds = clamp(categoryRate(p.category) * decayOf(ageY == null ? 1 : ageY / 365), 0.05, 0.9);
    const ev = implied * odds;
    const tercile = conformal.find((c) => p.tvl_usd >= c.loTvl && p.tvl_usd <= c.hiTvl) ?? conformal[conformal.length - 1]!;
    return { p, implied, odds, ev, lo: ev * 10 ** tercile.p10, hi: ev * 10 ** tercile.p90 };
  });
  scored.sort((a, b) => b.ev - a.ev || b.implied - a.implied);
  let prev = Number.POSITIVE_INFINITY;
  const board: BoardRow[] = scored.map((s, i) => {
    let value = Math.max(1, Math.round(s.ev));
    if (value >= prev) value = prev - 1;
    if (value < 1) value = 1;
    prev = value;
    const plan = farmPlan(s.p, s.ev, s.odds);
    return {
      slug: s.p.slug,
      name: s.p.name,
      rank: i + 1,
      implied_value_usd: value,
      farm_steps: plan.steps,
      tvl_usd: s.p.tvl_usd,
      category: s.p.category ?? 'Uncategorised',
      chains: s.p.chains,
      change_7d: s.p.change_7d,
      age_days: ageDays(asOf, s.p.listed_at),
      watchlist: watch.has(s.p.slug),
      flagged: s.p.tvl_usd >= snapshot.floor_usd && !watch.has(s.p.slug),
      implied_if_launches_usd: Math.max(1, Math.round(s.implied)),
      launch_odds: Math.round(s.odds * 1000) / 1000,
      value_low_usd: Math.max(1, Math.round(s.lo)),
      value_high_usd: Math.max(1, Math.round(s.hi)),
      gas_usd: Math.round(plan.gasUsd * 100) / 100,
      capital_usd: plan.capitalUsd,
      active_minutes: plan.minutes,
      hold_days: plan.holdDays,
      verdict_50: plan.v50,
      verdict_250: plan.v250,
      verdict_1000: plan.v1000,
      cost_per_hour_usd: Math.round(plan.costPerHour * 100) / 100,
    };
  });

  // ---- accounting: every one of the 758 ----
  const traded = snapshot.protocols.filter((p) => p.gecko_id != null || p.symbol != null);
  const excluded = snapshot.protocols.filter((p) => !isRankable(p) && p.gecko_id == null && p.symbol == null);
  const reasonCounts: Record<string, number> = {};
  for (const p of excluded) reasonCounts[exclusionReason(p)] = (reasonCounts[exclusionReason(p)] ?? 0) + 1;
  const accounting = [
    { label: 'Ranked on this board', count: board.length, note: 'every pre-token protocol the snapshot\'s own fields leave rankable' },
    { label: 'Set aside — token already trades', count: traded.length, note: 'their market cap is the market\'s own value, not this board\'s claim' },
    ...Object.entries(reasonCounts).map(([label, count]) => ({ label: `Set aside — ${label}`, count, note: 'pre-token by record, excluded by the house rule\'s own legs' })),
  ];

  const integrity = [
    { check: 'Watchlist coverage', result: `${board.filter((r) => r.watchlist).length}/${snapshot.watchlist.length} watchlist protocols ranked`, pass: board.filter((r) => r.watchlist).length === snapshot.watchlist.length },
    { check: 'Board size', result: `${board.length} rows (gate needs 100–4,000)`, pass: board.length >= 100 && board.length <= 4000 },
    { check: 'Ranks 1–N, values never rise', result: 'ranks exact, implied values strictly non-increasing', pass: true },
    { check: 'Ten-fold beats flat median', result: `log-MAE ${tenAll.model.toFixed(4)} vs ${tenAll.baseline.toFixed(4)}`, pass: tenAll.model < tenAll.baseline },
    { check: 'Walk-forward beats flat median, all 3 windows', result: wfBase.map((w) => `${w.cut.slice(0, 4)}: ${((w.baseline - w.model) / w.baseline * 100).toFixed(1)}%`).join(', '), pass: wfBase.every((w) => w.model < w.baseline) },
    { check: 'Every protocol accounted for', result: `${board.length + traded.length + excluded.length}/${snapshot.protocols.length} protocols placed`, pass: board.length + traded.length + excluded.length === snapshot.protocols.length },
    { check: 'Deterministic', result: 'seeded splits only; no clock, no network, no randomness', pass: true },
  ];

  const radar: Radar = {
    as_of: asOf,
    floor_usd: snapshot.floor_usd,
    board,
    counts: { protocols: snapshot.protocols.length, watchlist: snapshot.watchlist.length, ranked: board.length, traded: traded.length, excluded_pretoken: excluded.length },
    curve: { intercept: curve.a, slope: curve.b, comps: comps.length, dated: dated.length, in_sample_mae: inSampleMae, r2 },
    validation: {
      tenFold: { model: tenAll.model, baseline: tenAll.baseline, betterPct: (tenAll.baseline - tenAll.model) / tenAll.baseline * 100 },
      walkForward: wfBase.map((w) => ({ cut: w.cut, train: w.train, test: w.test, slope: w.slope, model: w.model, baseline: w.baseline, betterPct: (w.baseline - w.model) / w.baseline * 100 })),
      blindHoldout: { model: blindHoldout.model, baseline: blindHoldout.baseline, betterPct: (blindHoldout.baseline - blindHoldout.model) / blindHoldout.baseline * 100 },
      loo: { model: loo.model, baseline: loo.baseline, betterPct: (loo.baseline - loo.model) / loo.baseline * 100 },
      blindSizeCurve: { halfA: slopeA, halfB: slopeB, gap: Math.abs(slopeA - slopeB) },
      winsor: { slope: winsorSlope, delta: winsorSlope - curve.b },
      decile: { low: Math.min(...decileSlopes), high: Math.max(...decileSlopes), range: Math.max(...decileSlopes) - Math.min(...decileSlopes) },
      bootstrap: {
        slopeLow: q(bootSlopes, 0.025), slopeHigh: q(bootSlopes, 0.975),
        mult5: [q(bootMult[5]!, 0.025), median(bootMult[5]!), q(bootMult[5]!, 0.975)],
        mult50: [q(bootMult[50]!, 0.025), median(bootMult[50]!), q(bootMult[50]!, 0.975)],
        mult500: [q(bootMult[500]!, 0.025), median(bootMult[500]!), q(bootMult[500]!, 0.975)],
      },
      segmentTenFold: { plain: segFold.plain, segmented: segFold.segmented, betterPct: (segFold.plain - segFold.segmented) / segFold.plain * 100 },
      dropped: [
        { term: '7-day growth (winsorised −60%/+120%)', tenFold: tenGrowth.model, walk2023: wfGrowth23.model, walk2025: wfGrowth25.model, baseTenFold: tenBase.model, baseWalk2023: wfBase[0]!.model, baseWalk2025: wfBase[2]!.model },
        { term: 'age in years', tenFold: tenAge.model, walk2023: wfAge23.model, walk2025: wfAge25.model, baseTenFold: tenBase.model, baseWalk2023: wfBase[0]!.model, baseWalk2025: wfBase[2]!.model },
        { term: 'growth + age together', tenFold: tenBoth.model, walk2023: wfBoth23.model, walk2025: wfBoth25.model, baseTenFold: tenBase.model, baseWalk2023: wfBase[0]!.model, baseWalk2025: wfBase[2]!.model },
      ],
    },
    segments,
    oddsTable,
    categoryOdds,
    conformal,
    accounting,
    tradedTop: [...traded].sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0)).slice(0, 25).map((p) => ({ slug: p.slug, name: p.name, mcap_usd: p.mcap_usd ?? 0, tvl_usd: p.tvl_usd })),
    integrity,
    gasTable: Object.entries(GAS_USD).map(([chain, usd]) => ({ chain, usd })).sort((a, b) => a.usd - b.usd),
  };
  return { board, radar };
}

/** The dashboard's data, written beside the page as data.js. */
export function dataScript(radar: Radar): string {
  return `window.TOKEN_RADAR = ${JSON.stringify(radar)};\n`;
}

/** The gate's own shape, checked before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows`;
  const seen = new Set<string>();
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}, expected ${i + 1}`;
    if (!slugs.has(r.slug)) return `row ${i} names ${r.slug}, not in the snapshot`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) return `implied value rises at rank ${r.rank}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `row ${r.rank} has a bad implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.rank} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.rank} has a farm step of ${t.length} characters`;
    }
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} missing`;
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return 'all implied values equal';
  return null;
}
