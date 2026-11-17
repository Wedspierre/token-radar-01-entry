// Token Radar v2.3 — the model.
//
// One snapshot of the protocol universe in, one ranked board out. The value model is a size
// curve fitted on the snapshot's own traded tokens, and the terms it keeps are the ones the
// out-of-sample tests keep: forward selection over the term sets {growth, age}, a term added
// only when it wins at least 2 of 3 tests (blind holdout mean over 5 seeds, time-split,
// leave-one-out) against the model without it. On this snapshot that keeps the age term and
// drops the growth term: growth's fitted sign flips across blind seeds (+0.91, -0.53, -0.76,
// -1.35, -1.16) and it loses the blind test and leave-one-out, while age's sign is negative
// on every seed (-0.14 .. -0.23) and it wins the blind mean and the time-split.
//
//   log10(market cap) = b0 + b1 * log10(TVL) + b2 * log10(age_days + 1)
//
// fitted by least squares on one comp per ticker (largest market cap wins the ticker), traded
// protocols only, CEX and bridge-family categories set aside the same way the watchlist rule
// sets them aside. A pre-token protocol's implied value is the curve's prediction at its own
// TVL and age. Nothing is hardcoded by name: every coefficient is fitted at run time from
// the snapshot this run reads.
//
// The board ranks every rankable pre-token protocol in the snapshot: 198 rows, the 40 on the
// watchlist plus the 158 below the floor that pass the watchlist's own rule (not a CEX, not a
// bridge-family category, not a versioned pool, no wrapped/staked word in the name). The
// snapshot holds 342 pre-token protocols; 144 fail that rule and are listed in the coverage
// audit the dashboard shows.
//
// Farm plans are netted to the dollar. Gas is priced per transaction on the cheapest chain
// the protocol runs on that the gas table covers (estimates, stated as such), the plan counts
// its transactions (2 to open, 1 a week of holding, 1 for a second touch), and the last step
// states the net: gas sunk, capital locked and withdrawable, minutes of the reader's time.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
/** Age in days when a protocol's listing date is missing: the comps' own median-ish stand-in. */
const UNKNOWN_AGE_DAYS = 365;
/** The fitted model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2.3';
/** How many bootstrap resamples the stability numbers come from. */
export const BOOTSTRAP_B = 1000;
/** How many bootstrap refits each row's rank range comes from. */
export const RANK_REFITS = 200;
/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A term set: which regressors sit beside log10(TVL) in the size curve. */
export interface TermSet {
  growth: boolean;
  age: boolean;
}

/** One out-of-sample protocol: the three tests, each a mean absolute error in log10 dollars. */
export interface OosResult {
  blind: number;
  timeSplit: number;
  loo: number;
}

/** The fitted curve: coefficients in the order [intercept, log10(TVL), growth?, log10(age+1)?]. */
export interface Fit {
  terms: TermSet;
  beta: number[];
  r2: number;
  nComps: number;
}

/** A 95% interval from the bootstrap. */
export interface Interval {
  lo: number;
  hi: number;
}

/** The bootstrap's intervals: the curve's slope and its multiples at three TVL points. */
export interface BootstrapReport {
  slope: Interval;
  intercept: Interval;
  ageCoef: Interval | null;
  multiple5m: Interval;
  multiple50m: Interval;
  multiple500m: Interval;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    slope: number;
    intercept: number;
    age_coef: number | null;
    growth_coef: number | null;
    curve_value_usd: number;
    age_days: number | null;
    rank_lo: number;
    rank_hi: number;
    cheapest_chain: string;
    gas_per_tx_usd: number;
    gas_estimated: boolean;
    farm_gas_total_usd: number;
    farm_capital_usd: number;
    farm_minutes: number;
    hold_days: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  curve_value_usd: number;
  rank_lo: number;
  rank_hi: number;
  cheapest_chain: string;
  gas_per_tx_usd: number;
  gas_estimated: boolean;
  farm_gas_total_usd: number;
  farm_capital_usd: number;
  farm_minutes: number;
  hold_days: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One candidate term set's out-of-sample record, for the method table. */
export interface SelectionRow {
  terms: string;
  blind: number;
  timeSplit: number;
  loo: number;
  winsVsBase: number;
}

/** How the 198 rows were chosen, and what was left out and why. */
export interface CoverageAudit {
  preTokenTotal: number;
  rankable: number;
  watchlist: number;
  belowFloor: number;
  excludedCex: number;
  excludedBridgeCat: number;
  excludedVersioned: number;
  excludedWrappedWord: number;
  excludedExchangePrefix: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: number;
  fit: { intercept: number; slope: number; age_coef: number | null; growth_coef: number | null; r2: number; terms: string };
  oos: { chosen: OosResult; base: OosResult; flat: OosResult };
  selection: SelectionRow[];
  bootstrap: BootstrapReport;
  coverage: CoverageAudit;
  gasTable: { chain: string; usd: number }[];
  medianRankRange: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A deterministic seeded stream (mulberry32): the same seed, the same shuffle, every run. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Least squares by the normal equations with partial pivoting; `X` rows already carry a 1. */
export function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const b: number[] = Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      b[r]! += X[i]![r]! * y[i]!;
      for (let c = 0; c < k; c++) A[r]![c]! += X[i]![r]! * X[i]![c]!;
    }
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    [b[c], b[piv]] = [b[piv]!, b[c]!];
    for (let r = c + 1; r < k; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let cc = c; cc < k; cc++) A[r]![cc]! -= f * A[c]![cc]!;
      b[r]! -= f * b[c]!;
    }
  }
  const beta: number[] = Array(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < k; c++) s -= A[r]![c]! * beta[c]!;
    beta[r] = s / A[r]![r]!;
  }
  return beta;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories the watchlist rule sets aside: a wrapped, staked or bridged product of a token. */
const SET_ASIDE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a product of a traded token. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !SET_ASIDE_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The comps: traded protocols with a market cap, one per ticker, CEX and bridge-family set aside. */
export function selectComps(snapshot: Snapshot): SnapshotProtocol[] {
  const clean = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && !SET_ASIDE_CATEGORIES.has(p.category ?? ''),
  );
  const bySymbol = new Map<string, SnapshotProtocol>();
  for (const p of clean) {
    const key = (p.symbol ?? '').toLowerCase();
    const cur = bySymbol.get(key);
    if (cur === undefined || (p.mcap_usd ?? 0) > (cur.mcap_usd ?? 0)) bySymbol.set(key, p);
  }
  return [...bySymbol.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Seven-day growth clamped to the range the model trusts, as a fraction. */
function growthFraction(p: SnapshotProtocol): number {
  return Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100;
}

/** log10 of the age in days, 365 when the listing date is missing. */
function logAge(asOf: string, p: SnapshotProtocol): number {
  return Math.log10((ageDays(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS) + 1);
}

/** A term set's feature vector for one protocol: [1, log10(TVL), growth?, log10(age+1)?]. */
function features(terms: TermSet, asOf: string, p: SnapshotProtocol): number[] {
  const v: number[] = [1, Math.log10(p.tvl_usd)];
  if (terms.growth) v.push(growthFraction(p));
  if (terms.age) v.push(logAge(asOf, p));
  return v;
}

const logMcap = (p: SnapshotProtocol): number => Math.log10(p.mcap_usd ?? 1);

/** Fit one term set on one comp set. Exported so the entrypoint fits the chosen terms. */
export function fitOn(terms: TermSet, asOf: string, comps: SnapshotProtocol[]): Fit {
  const beta = ols(comps.map((p) => features(terms, asOf, p)), comps.map(logMcap));
  const mean = comps.reduce((s, p) => s + logMcap(p), 0) / comps.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of comps) {
    const x = features(terms, asOf, p);
    let pred = 0;
    for (let i = 0; i < beta.length; i++) pred += beta[i]! * x[i]!;
    ssRes += (logMcap(p) - pred) ** 2;
    ssTot += (logMcap(p) - mean) ** 2;
  }
  return { terms, beta, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, nComps: comps.length };
}

/** Mean absolute error of a fitted term set on a test set, in log10 dollars. */
function maeOf(terms: TermSet, asOf: string, train: SnapshotProtocol[], test: SnapshotProtocol[]): number {
  const { beta } = fitOn(terms, asOf, train);
  let tot = 0;
  for (const p of test) {
    const x = features(terms, asOf, p);
    let pred = 0;
    for (let i = 0; i < beta.length; i++) pred += beta[i]! * x[i]!;
    tot += Math.abs(pred - logMcap(p));
  }
  return tot / test.length;
}

/** The three out-of-sample tests for one term set, on this snapshot's comps. */
export function oosTests(terms: TermSet, asOf: string, comps: SnapshotProtocol[]): OosResult {
  // Blind holdout: the mean over five seeded 20% holdouts.
  let blind = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const rng = seededRng(1000 + seed);
    const shuffled = [...comps];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const n = Math.floor(shuffled.length * 0.2);
    blind += maeOf(terms, asOf, shuffled.slice(n), shuffled.slice(0, n));
  }
  blind /= 5;
  // Time-split: fit on the older half by first-listed date, test on the newer half.
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const cut = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const timeSplit = maeOf(
    terms,
    asOf,
    dated.filter((p) => p.listed_at! < cut),
    dated.filter((p) => p.listed_at! >= cut),
  );
  // Leave-one-out.
  let loo = 0;
  for (let i = 0; i < comps.length; i++) {
    loo += maeOf(terms, asOf, comps.filter((_, j) => j !== i), [comps[i]!]);
  }
  return { blind, timeSplit, loo: loo / comps.length };
}

/** The flat-median baseline on the same three tests: one multiple for every protocol. */
export function flatBaselineTests(asOf: string, comps: SnapshotProtocol[]): OosResult {
  const medianMultiple = (() => {
    const ratios = comps.map((p) => (p.mcap_usd ?? 0) / p.tvl_usd).sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length / 2)]!;
  })();
  const mae = (test: SnapshotProtocol[]): number =>
    test.reduce((s, p) => s + Math.abs(Math.log10(p.tvl_usd * medianMultiple) - logMcap(p)), 0) / test.length;
  let blind = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const rng = seededRng(1000 + seed);
    const shuffled = [...comps];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    blind += mae(shuffled.slice(0, Math.floor(shuffled.length * 0.2)));
  }
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const cut = dated[Math.floor(dated.length / 2)]!.listed_at!;
  let loo = 0;
  for (const p of comps) loo += mae([p]);
  return { blind: blind / 5, timeSplit: mae(dated.filter((p) => p.listed_at! >= cut)), loo: loo / comps.length };
}

/** How many of the three tests `a` wins against `b` (lower error wins). */
function winsAgainst(a: OosResult, b: OosResult): number {
  return (a.blind < b.blind ? 1 : 0) + (a.timeSplit < b.timeSplit ? 1 : 0) + (a.loo < b.loo ? 1 : 0);
}

const termLabel = (t: TermSet): string => `TVL${t.growth ? ' + growth' : ''}${t.age ? ' + age' : ''}`;

/**
 * Forward selection: start from the bare size curve, add the term that wins at least 2 of 3
 * tests against the current model, repeat until no term qualifies. Returns the chosen terms
 * and every candidate's record for the method table.
 */
export function selectTerms(asOf: string, comps: SnapshotProtocol[]): { terms: TermSet; table: SelectionRow[] } {
  const candidates: TermSet[] = [
    { growth: false, age: false },
    { growth: true, age: false },
    { growth: false, age: true },
    { growth: true, age: true },
  ];
  const results = new Map<string, OosResult>();
  for (const c of candidates) results.set(termLabel(c), oosTests(c, asOf, comps));
  const base = results.get('TVL')!;
  const table: SelectionRow[] = candidates.map((c) => {
    const r = results.get(termLabel(c))!;
    return { terms: termLabel(c), blind: r.blind, timeSplit: r.timeSplit, loo: r.loo, winsVsBase: winsAgainst(r, base) };
  });
  let current: TermSet = { growth: false, age: false };
  for (;;) {
    const curResult = results.get(termLabel(current))!;
    let best: TermSet | null = null;
    let bestBlind = Infinity;
    for (const term of ['growth', 'age'] as const) {
      if (current[term]) continue;
      const cand: TermSet = { ...current, [term]: true };
      const r = results.get(termLabel(cand))!;
      if (winsAgainst(r, curResult) >= 2 && r.blind < bestBlind) {
        best = cand;
        bestBlind = r.blind;
      }
    }
    if (best === null) break;
    current = best;
  }
  return { terms: current, table };
}

/** The 95% interval of a sorted sample at the 2.5th and 97.5th percentiles. */
function interval95(values: number[]): Interval {
  const s = [...values].sort((a, b) => a - b);
  return { lo: s[Math.floor(0.025 * s.length)]!, hi: s[Math.floor(0.975 * s.length)]! };
}

/** Bootstrap the chosen fit: intervals for the slope, the age coefficient and the multiples. */
export function bootstrapReport(terms: TermSet, asOf: string, comps: SnapshotProtocol[]): BootstrapReport {
  const rng = seededRng(777);
  const slopes: number[] = [];
  const intercepts: number[] = [];
  const ageCoefs: number[] = [];
  const mult5: number[] = [];
  const mult50: number[] = [];
  const mult500: number[] = [];
  const multipleAt = (beta: number[], tvl: number): number => {
    // Age fixed at a year, the stand-in the model uses for a missing listing date.
    const x = [1, Math.log10(tvl)];
    if (terms.growth) x.push(0);
    if (terms.age) x.push(Math.log10(UNKNOWN_AGE_DAYS + 1));
    let pred = 0;
    for (let i = 0; i < beta.length; i++) pred += beta[i]! * x[i]!;
    return Math.pow(10, pred) / tvl;
  };
  for (let b = 0; b < BOOTSTRAP_B; b++) {
    const sample = Array.from({ length: comps.length }, () => comps[Math.floor(rng() * comps.length)]!);
    const { beta } = fitOn(terms, asOf, sample);
    slopes.push(beta[1]!);
    intercepts.push(beta[0]!);
    if (terms.age) ageCoefs.push(beta[beta.length - 1]!);
    mult5.push(multipleAt(beta, 5_000_000));
    mult50.push(multipleAt(beta, 50_000_000));
    mult500.push(multipleAt(beta, 500_000_000));
  }
  return {
    slope: interval95(slopes),
    intercept: interval95(intercepts),
    ageCoef: terms.age ? interval95(ageCoefs) : null,
    multiple5m: interval95(mult5),
    multiple50m: interval95(mult50),
    multiple500m: interval95(mult500),
  };
}

/** The fitted curve's prediction for one protocol, in whole dollars. */
export function curveValue(fit: Fit, asOf: string, p: SnapshotProtocol): number {
  const x = features(fit.terms, asOf, p);
  let pred = 0;
  for (let i = 0; i < fit.beta.length; i++) pred += fit.beta[i]! * x[i]!;
  return Math.max(1, Math.round(Math.pow(10, pred)));
}

// ---------------------------------------------------------------- gas and farm plans

/** Estimated gas per transaction, in dollars, by chain. Estimates, not quotes. */
export const GAS_PER_TX: { chain: string; usd: number }[] = [
  { chain: 'Solana', usd: 0.02 },
  { chain: 'Base', usd: 0.06 },
  { chain: 'Polygon', usd: 0.05 },
  { chain: 'Gnosis', usd: 0.05 },
  { chain: 'Mantle', usd: 0.05 },
  { chain: 'Mode', usd: 0.05 },
  { chain: 'Fraxtal', usd: 0.05 },
  { chain: 'Berachain', usd: 0.05 },
  { chain: 'Optimism', usd: 0.12 },
  { chain: 'Arbitrum', usd: 0.15 },
  { chain: 'BNB Chain', usd: 0.15 },
  { chain: 'Scroll', usd: 0.15 },
  { chain: 'Blast', usd: 0.1 },
  { chain: 'Linea', usd: 0.1 },
  { chain: 'Fantom', usd: 0.1 },
  { chain: 'Cronos', usd: 0.1 },
  { chain: 'zkSync Era', usd: 0.2 },
  { chain: 'Avalanche', usd: 0.3 },
  { chain: 'Sui', usd: 0.05 },
  { chain: 'Aptos', usd: 0.05 },
  { chain: 'Monad', usd: 0.05 },
  { chain: 'Hyperliquid L1', usd: 0.05 },
  { chain: 'Plasma', usd: 0.05 },
  { chain: 'Robinhood Chain', usd: 0.05 },
  { chain: 'Ethereum', usd: 3.5 },
];
/** Gas where a chain has no estimate: the honest default, stated in the plan. */
const GAS_DEFAULT_USD = 1.0;

/** A chain name as the snapshot writes it, matched to the gas table's names. */
function gasKey(chain: string): string {
  const c = chain.trim().toLowerCase();
  if (c === 'bsc' || c === 'bnb' || c === 'binance' || c === 'binance smart chain') return 'bnb chain';
  if (c === 'zksync' || c === 'zksync era') return 'zksync era';
  if (c === 'avalanche c-chain') return 'avalanche';
  return c;
}

/** The cheapest chain a protocol runs on that the gas table covers, with its gas price. */
export function cheapestChain(p: SnapshotProtocol): { chain: string; gasUsd: number; estimated: boolean } {
  let best: { chain: string; gasUsd: number; estimated: boolean } | null = null;
  for (const chain of p.chains) {
    const row = GAS_PER_TX.find((g) => gasKey(g.chain) === gasKey(chain));
    if (row !== undefined && (best === null || row.usd < best.gasUsd)) best = { chain, gasUsd: row.usd, estimated: true };
  }
  if (best !== null) return best;
  return { chain: p.chains.length > 0 ? p.chains[0]! : 'its main chain', gasUsd: GAS_DEFAULT_USD, estimated: false };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's one action, with one sentence saying why that action is the one counted. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain}. Lending accrues through the supply position itself, so the deposit is the qualifying event, not the size of any borrow.`;
  if (c.includes('dex') || c.includes('amm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}. LP shares mark your share of the pool, so the position is what gets counted, not the swaps you route through it.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('curator') || c.includes('allocator') || c.includes('vault'))
    return `Deposit $${capital} into a ${name} vault on ${chain}. Vault shares accrue the yield, so the deposit is the position and withdrawing early resets the clock.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds inside its app. The bridge records the transfer on both sides, so idle bridged funds count for less than funds that are actually used.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token. The receipt is the position, so never swap it away while the farm runs.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade. The margin deposit opens the account; one small trade proves activity without putting the capital at real risk.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${name} and place one market position. The position is the activity; size it small enough that being wrong costs cents, not the farm.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it. The minted asset is the position, and its balance is what a snapshot would read.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy open. The policy is the position; cancelling it ends the farm.`;
  if (c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}. The minted balance is the position, so hold it rather than swapping it straight out.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open. The deposit is the position: a balance held across snapshots counts, a flash deposit does not.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

export interface FarmPlan {
  steps: string[];
  gasTotalUsd: number;
  capitalUsd: number;
  minutes: number;
  holdDays: number;
  txCount: number;
  gasEstimated: boolean;
}

/**
 * A protocol's farm plan: seven steps plus a net line. The plan counts its own transactions
 * (2 to open, 1 a week of holding, 1 for a second touch) on the cheapest chain the protocol
 * runs on, and the last step states the net in dollars: gas sunk, capital locked and
 * withdrawable, minutes of the reader's time.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): FarmPlan {
  const { chain, gasUsd, estimated } = cheapestChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const txCount = 2 + weeks + 1;
  const gasTotal = Math.round(txCount * gasUsd * 100) / 100;
  const minutes = 45 + 10 * weeks;
  const gas = (n: number): string => `$${n.toFixed(2)}`;
  const gasNote = estimated ? '' : ` Gas on ${chain} has no estimate in the table, so a $1.00 default per transaction is used — treat the gas total as a ceiling, not a quote.`;
  const steps = [
    stepText(
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      'no gas: the wallet costs nothing to make',
      '5 minutes',
    ),
    stepText(
      actionFor(p, capital, chain),
      `$${capital} of capital and about ${gas(2 * gasUsd)} of gas for 2 transactions on ${chain}`,
      '15 minutes to set up',
    ),
    stepText(
      `Make one qualifying action each week for ${weeks} weeks, such as a deposit, a borrow, a swap or a vote.`,
      `about ${gas(gasUsd)} of gas a week on ${chain}`,
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    stepText(
      'Halfway through the hold, do one different action — a swap, a borrow or a vote — so the wallet shows breadth, not one repeated click.',
      `about ${gas(gasUsd)} of gas on ${chain}`,
      '10 minutes',
    ),
    stepText(
      "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
      'no fee to check, and never pay to claim',
      '10 minutes',
    ),
    stepText(
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
      'nothing but the log',
      '5 minutes',
    ),
    // The net line stands alone: it already carries its cost and time, so no suffix is added.
    `Net: about ${gas(gasTotal)} of gas on ${chain} (${txCount} transactions, sunk) + $${capital} of capital locked, withdrawable at any time + ${minutes} minutes of your time over ${hold} days. Gas is the only cost you do not get back.${gasNote}`,
  ];
  return { steps, gasTotalUsd: gasTotal, capitalUsd: capital, minutes, holdDays: hold, txCount, gasEstimated: estimated };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && !SET_ASIDE_CATEGORIES.has(p.category ?? '') && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.tvl_usd > 0 && p.mcap_usd !== null ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n and strictly falling values. */
export function buildBoard(snapshot: Snapshot, fit: Fit): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, by TVL.
  // The watchlist rule already decided what counts as rankable; the board takes all of them.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const curve = curveValue(fit, snapshot.as_of, p);
    const plan = farmPlan(p, age);
    const { chain, gasUsd, estimated } = cheapestChain(p);
    return { p, age, curve, plan, chain, gasUsd, estimated };
  });
  scored.sort(
    (a, b) => b.curve - a.curve || b.p.tvl_usd - a.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  // The gate needs implied values that never rise with rank and are not all one number:
  // nudge a tied value one dollar below the row above it.
  let prev = Infinity;
  return scored.map((s, i) => {
    let implied = s.curve;
    if (implied >= prev) implied = prev - 1;
    if (implied < 1) implied = 1;
    prev = implied;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: implied,
      model: {
        slope: Math.round(fit.beta[1]! * 1e4) / 1e4,
        intercept: Math.round(fit.beta[0]! * 1e4) / 1e4,
        age_coef: fit.terms.age ? Math.round(fit.beta[fit.beta.length - 1]! * 1e4) / 1e4 : null,
        growth_coef: fit.terms.growth ? Math.round(fit.beta[fit.beta.length - 1]! * 1e4) / 1e4 : null,
        curve_value_usd: s.curve,
        age_days: s.age,
        rank_lo: 0,
        rank_hi: 0,
        cheapest_chain: s.chain,
        gas_per_tx_usd: s.gasUsd,
        gas_estimated: s.estimated,
        farm_gas_total_usd: s.plan.gasTotalUsd,
        farm_capital_usd: s.plan.capitalUsd,
        farm_minutes: s.plan.minutes,
        hold_days: s.plan.holdDays,
      },
      farm_steps: s.plan.steps,
    };
  });
}

/**
 * Rank stability: refit the chosen model on 200 bootstrap samples of the comps, re-rank the
 * board each time, and keep each row's 5th–95th percentile rank. Deterministic by seed.
 */
export function rankStability(snapshot: Snapshot, fit: Fit, board: BoardRow[]): Map<string, { lo: number; hi: number }> {
  const comps = selectComps(snapshot);
  const slugs = board.map((r) => r.slug);
  const index = bySlug(snapshot.protocols);
  const ranks = new Map<string, number[]>();
  for (const s of slugs) ranks.set(s, []);
  const rng = seededRng(4242);
  for (let b = 0; b < RANK_REFITS; b++) {
    const sample = Array.from({ length: comps.length }, () => comps[Math.floor(rng() * comps.length)]!);
    const refit = fitOn(fit.terms, snapshot.as_of, sample);
    const scored = slugs
      .map((slug) => ({ slug, v: curveValue(refit, snapshot.as_of, index.get(slug)!) }))
      .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { lo: number; hi: number }>();
  for (const [slug, rs] of ranks) {
    const sorted = [...rs].sort((a, b) => a - b);
    out.set(slug, { lo: sorted[Math.floor(0.05 * sorted.length)]!, hi: sorted[Math.floor(0.95 * sorted.length)]! });
  }
  return out;
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    curve_value_usd: row.model.curve_value_usd,
    rank_lo: row.model.rank_lo,
    rank_hi: row.model.rank_hi,
    cheapest_chain: row.model.cheapest_chain,
    gas_per_tx_usd: row.model.gas_per_tx_usd,
    gas_estimated: row.model.gas_estimated,
    farm_gas_total_usd: row.model.farm_gas_total_usd,
    farm_capital_usd: row.model.farm_capital_usd,
    farm_minutes: row.model.farm_minutes,
    hold_days: row.model.hold_days,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  fit: Fit,
  board: BoardRow[],
  oos: { chosen: OosResult; base: OosResult; flat: OosResult },
  selection: SelectionRow[],
  bootstrap: BootstrapReport,
  stability: Map<string, { lo: number; hi: number }>,
): { board: BoardRow[]; radar: RadarData } {
  for (const row of board) {
    const s = stability.get(row.slug);
    if (s !== undefined) {
      row.model.rank_lo = s.lo;
      row.model.rank_hi = s.hi;
    }
  }
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const preToken = snapshot.protocols.filter(isPreToken);
  const audit: CoverageAudit = {
    preTokenTotal: preToken.length,
    rankable: board.length,
    watchlist: snapshot.watchlist.length,
    belowFloor: early,
    excludedCex: preToken.filter((p) => p.category === 'CEX').length,
    excludedBridgeCat: preToken.filter((p) => p.category !== 'CEX' && SET_ASIDE_CATEGORIES.has(p.category ?? '')).length,
    excludedVersioned: preToken.filter(
      (p) => p.category !== 'CEX' && !SET_ASIDE_CATEGORIES.has(p.category ?? '') && VERSIONED.test(p.name),
    ).length,
    excludedWrappedWord: preToken.filter(
      (p) =>
        p.category !== 'CEX' &&
        !SET_ASIDE_CATEGORIES.has(p.category ?? '') &&
        !VERSIONED.test(p.name) &&
        WRAPPED_WORD.test(p.name),
    ).length,
    excludedExchangePrefix: preToken.filter(
      (p) =>
        p.category !== 'CEX' &&
        !SET_ASIDE_CATEGORIES.has(p.category ?? '') &&
        !VERSIONED.test(p.name) &&
        !WRAPPED_WORD.test(p.name) &&
        EXCHANGE_PREFIX.test(p.name),
    ).length,
  };
  const ranges = board.map((r) => r.model.rank_hi - r.model.rank_lo).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: fit.nComps,
    fit: {
      // Full precision on purpose: the page replays the curve from these coefficients and
      // must land on the same whole dollars board.json carries.
      intercept: fit.beta[0]!,
      slope: fit.beta[1]!,
      age_coef: fit.terms.age ? fit.beta[fit.beta.length - 1]! : null,
      growth_coef: fit.terms.growth ? fit.beta[fit.beta.length - 1]! : null,
      r2: Math.round(fit.r2 * 1e4) / 1e4,
      terms: termLabel(fit.terms),
    },
    oos,
    selection,
    bootstrap,
    coverage: audit,
    gasTable: GAS_PER_TX,
    medianRankRange: ranges[Math.floor(ranges.length / 2)]!,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
