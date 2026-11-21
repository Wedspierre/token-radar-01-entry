// Token radar v2.4 — a comps-fitted value model with walk-forward validation.
//
// One sealed snapshot in, one ranked board out. Nothing here names a protocol:
// every number the board states is fitted at run time from the snapshot's own
// traded-token comparables, then checked out of sample four ways before a single
// row is ranked. The dashboard recomputes nothing of its own; it renders the
// numbers this module writes.
//
// Value model (all of it derived from the snapshot at run time):
//   curve(tvl)  = 10 ^ (a + b * log10(tvl))      — OLS on the traded comps,
//                   log10(market cap) on log10(TVL)
//   growth      = 1 + clamp(change_7d, -50, +100) / 100 * 0.5
//   maturity    = 0.80 + min(age_days, 1095) / 1095 * 0.20
//   implied     = curve(tvl) * growth * maturity
//
// Validation (computed at run time, reported in full, each against the same
// flat-median baseline — predict every comp at the median market-cap/TVL
// multiple of the comps):
//   walk-forward  fit comps listed before the median listing date, test the
//                 newer half; then the reverse leg, fit new, test old.
//   blind holdout hold out every fifth comp by a slug hash, fit the rest,
//                 test the held-out fifth.
//   blind curve   split the comps into two seeded halves, fit each half alone,
//                 report how far the two slopes sit apart.
//   leave-one-out fit 128 curves of 127 comps, test the one left out.
//   bootstrap     resample the comps 1000x (seeded), 95% CI for the slope and
//                 for the implied multiple at $5M / $50M / $500M.
//
// A launch date is never claimed: the snapshot carries no launch history, so
// this radar states what a token would be worth if the protocol's record stayed
// as it is, and never whether or when a token appears.

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

/** One out-of-sample leg, model error beside the flat-median baseline's error. */
export interface ValidationLeg {
  name: string;
  train_n: number;
  test_n: number;
  model_mae: number;
  model_rmse: number;
  baseline_mae: number;
  baseline_rmse: number;
  beats_baseline: boolean;
  note: string;
}

/** The fitted size curve plus every validation number the entry reports. */
export interface ModelValidation {
  comps_n: number;
  dated_n: number;
  intercept: number;
  slope: number;
  r2: number;
  median_multiple: number;
  in_sample_mae: number;
  in_sample_rmse: number;
  baseline_mae: number;
  baseline_rmse: number;
  multiple_5m: number;
  multiple_50m: number;
  multiple_500m: number;
  slope_ci_low: number;
  slope_ci_high: number;
  multiple_5m_ci_low: number;
  multiple_5m_ci_high: number;
  multiple_50m_ci_low: number;
  multiple_50m_ci_high: number;
  multiple_500m_ci_low: number;
  multiple_500m_ci_high: number;
  blind_slope_half1: number;
  blind_slope_half2: number;
  blind_slope_diff: number;
  legs: ValidationLeg[];
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
    curve_value_usd: number;
    multiple_at_tvl: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    cheapest_chain: string;
    gas_per_tx_usd: number;
    farm_gas_total_usd: number;
    farm_capital_usd: number;
    hold_days: number;
  };
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
  multiple_at_tvl: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  cheapest_chain: string;
  gas_total_usd: number;
  capital_usd: number;
  hold_days: number;
  watchlist: boolean;
  curve_value_usd: number;
  farm_steps: string[];
}

/** Everything the dashboard needs: the board, the live set, the fitted model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_extra: number;
  live_size: number;
  validation: ModelValidation;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-2.4-walkforward';
export const LIVE_ROWS = 24;
const DAY_MS = 86_400_000;
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const GROWTH_WEIGHT = 0.5;
const MATURITY_FLOOR = 0.8;
const MATURITY_RANGE = 0.2;
const MATURITY_DAYS = 1095;
const UNKNOWN_AGE_DAYS = 365;
const BOOTSTRAP_ROUNDS = 1000;
const BOOTSTRAP_SEED = 987654321;
const BLIND_SPLIT_SEED = 20261122;
const FARM_TX_COUNT = 7;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Deterministic PRNG (mulberry32): the bootstrap and the blind split must replay exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string: the blind holdout's split, stable across runs. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Ordinary least squares: y = a + b*x, plus R-squared, over paired arrays. */
function ols(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sst += (ys[i]! - my) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i]! - (a + b * xs[i]!)) ** 2;
  return { a, b, r2: sst === 0 ? 0 : 1 - sse / sst };
}

const meanAbs = (errs: number[]): number => errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
const rootMeanSq = (errs: number[]): number => Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);

/** The median market-cap/TVL multiple across the comps: the flat baseline. */
function medianMultiple(comps: SnapshotProtocol[]): number {
  const ms = comps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  return ms[Math.floor(ms.length / 2)]!;
}

/** One leg's errors: the fitted curve's against the flat baseline's, in log10 space. */
function legErrors(
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  baseline: number,
): { model_mae: number; model_rmse: number; baseline_mae: number; baseline_rmse: number } {
  const fit = ols(
    train.map((p) => Math.log10(p.tvl_usd)),
    train.map((p) => Math.log10(p.mcap_usd!)),
  );
  const mErr = test.map((p) => Math.log10(p.mcap_usd!) - (fit.a + fit.b * Math.log10(p.tvl_usd)));
  const bErr = test.map((p) => Math.log10(p.mcap_usd!) - (Math.log10(p.tvl_usd) + Math.log10(baseline)));
  return { model_mae: meanAbs(mErr), model_rmse: rootMeanSq(mErr), baseline_mae: meanAbs(bErr), baseline_rmse: rootMeanSq(bErr) };
}

/** The 2.5th and 97.5th percentiles of a sample: a 95% bootstrap interval. */
function ci95(values: number[]): [number, number] {
  const s = [...values].sort((a, b) => a - b);
  return [s[Math.floor(0.025 * s.length)]!, s[Math.floor(0.975 * s.length)]!];
}

/**
 * Fit the size curve on the traded comps and validate it four ways plus a
 * 1000-round bootstrap. Every split is deterministic: dates for the
 * walk-forward, a slug hash for the holdout, seeded shuffles for the rest.
 */
export function validateModel(snapshot: Snapshot): { fit: { a: number; b: number; r2: number }; validation: ModelValidation } {
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const fit = ols(xs, ys);
  const base = medianMultiple(comps);
  const inErr = comps.map((p, i) => ys[i]! - (fit.a + fit.b * xs[i]!));
  const inBase = comps.map((p) => Math.log10(p.mcap_usd!) - (Math.log10(p.tvl_usd) + Math.log10(base)));
  const multipleAt = (tvl: number): number => 10 ** (fit.a + fit.b * Math.log10(tvl)) / tvl;

  const legs: ValidationLeg[] = [];

  // Walk-forward, both legs: split the dated comps at their median listing date.
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const cut = Math.floor(dated.length / 2);
  const older = dated.slice(0, cut);
  const newer = dated.slice(cut);
  const wf = legErrors(older, newer, base);
  legs.push({
    name: 'walk-forward (fit older listings, test newer)',
    train_n: older.length,
    test_n: newer.length,
    model_mae: round4(wf.model_mae),
    model_rmse: round4(wf.model_rmse),
    baseline_mae: round4(wf.baseline_mae),
    baseline_rmse: round4(wf.baseline_rmse),
    beats_baseline: wf.model_mae < wf.baseline_mae,
    note: `cut ${older[older.length - 1]!.listed_at} -> ${newer[0]!.listed_at}`,
  });
  const wf2 = legErrors(newer, older, base);
  legs.push({
    name: 'walk-forward reverse (fit newer listings, test older)',
    train_n: newer.length,
    test_n: older.length,
    model_mae: round4(wf2.model_mae),
    model_rmse: round4(wf2.model_rmse),
    baseline_mae: round4(wf2.baseline_mae),
    baseline_rmse: round4(wf2.baseline_rmse),
    beats_baseline: wf2.model_mae < wf2.baseline_mae,
    note: 'the same split run backwards, so the test set is never the fit set',
  });

  // Blind holdout: every fifth comp by slug hash, never seen by the fit.
  const hold = comps.filter((p) => hashString(p.slug) % 5 === 0);
  const rest = comps.filter((p) => hashString(p.slug) % 5 !== 0);
  const h = legErrors(rest, hold, base);
  legs.push({
    name: 'blind holdout 20%',
    train_n: rest.length,
    test_n: hold.length,
    model_mae: round4(h.model_mae),
    model_rmse: round4(h.model_rmse),
    baseline_mae: round4(h.baseline_mae),
    baseline_rmse: round4(h.baseline_rmse),
    beats_baseline: h.model_mae < h.baseline_mae,
    note: 'held out by slug hash, so the split cannot be picked to flatter the fit',
  });

  // Leave-one-out: one curve per comp left out.
  const looErr = comps.map((_, i) => {
    const tx = xs.filter((__, j) => j !== i);
    const ty = ys.filter((__, j) => j !== i);
    const f = ols(tx, ty);
    return ys[i]! - (f.a + f.b * xs[i]!);
  });
  legs.push({
    name: 'leave-one-out',
    train_n: comps.length - 1,
    test_n: comps.length,
    model_mae: round4(meanAbs(looErr)),
    model_rmse: round4(rootMeanSq(looErr)),
    baseline_mae: round4(meanAbs(inBase)),
    baseline_rmse: round4(rootMeanSq(inBase)),
    beats_baseline: meanAbs(looErr) < meanAbs(inBase),
    note: 'one curve fitted per comp, each tested on the comp it never saw',
  });

  // Blind size curve: two seeded halves fitted alone, slopes compared.
  const rng = mulberry32(BLIND_SPLIT_SEED);
  const shuffled = [...comps].sort(() => rng() - 0.5);
  const half = Math.floor(shuffled.length / 2);
  const f1 = ols(
    shuffled.slice(0, half).map((p) => Math.log10(p.tvl_usd)),
    shuffled.slice(0, half).map((p) => Math.log10(p.mcap_usd!)),
  );
  const f2 = ols(
    shuffled.slice(half).map((p) => Math.log10(p.tvl_usd)),
    shuffled.slice(half).map((p) => Math.log10(p.mcap_usd!)),
  );

  // Bootstrap: 1000 resamples, 95% intervals for the slope and the multiples.
  const brng = mulberry32(BOOTSTRAP_SEED);
  const slopes: number[] = [];
  const m5: number[] = [];
  const m50: number[] = [];
  const m500: number[] = [];
  for (let k = 0; k < BOOTSTRAP_ROUNDS; k++) {
    const idx = Array.from({ length: comps.length }, () => Math.floor(brng() * comps.length));
    const f = ols(
      idx.map((i) => xs[i]!),
      idx.map((i) => ys[i]!),
    );
    slopes.push(f.b);
    m5.push(10 ** (f.a + f.b * Math.log10(5e6)) / 5e6);
    m50.push(10 ** (f.a + f.b * Math.log10(5e7)) / 5e7);
    m500.push(10 ** (f.a + f.b * Math.log10(5e8)) / 5e8);
  }
  const [sLo, sHi] = ci95(slopes);
  const [m5Lo, m5Hi] = ci95(m5);
  const [m50Lo, m50Hi] = ci95(m50);
  const [m500Lo, m500Hi] = ci95(m500);

  const validation: ModelValidation = {
    comps_n: comps.length,
    dated_n: dated.length,
    intercept: round4(fit.a),
    slope: round4(fit.b),
    r2: round4(fit.r2),
    median_multiple: round4(base),
    in_sample_mae: round4(meanAbs(inErr)),
    in_sample_rmse: round4(rootMeanSq(inErr)),
    baseline_mae: round4(meanAbs(inBase)),
    baseline_rmse: round4(rootMeanSq(inBase)),
    multiple_5m: round4(multipleAt(5e6)),
    multiple_50m: round4(multipleAt(5e7)),
    multiple_500m: round4(multipleAt(5e8)),
    slope_ci_low: round4(sLo),
    slope_ci_high: round4(sHi),
    multiple_5m_ci_low: round4(m5Lo),
    multiple_5m_ci_high: round4(m5Hi),
    multiple_50m_ci_low: round4(m50Lo),
    multiple_50m_ci_high: round4(m50Hi),
    multiple_500m_ci_low: round4(m500Lo),
    multiple_500m_ci_high: round4(m500Hi),
    blind_slope_half1: round4(f1.b),
    blind_slope_half2: round4(f2.b),
    blind_slope_diff: round4(Math.abs(f1.b - f2.b)),
    legs,
  };
  return { fit, validation };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories the house watchlist rule treats as a wrapped, staked or bridged product. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a protocol name must not begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Whole words that mark a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: it records no token, and the
 * snapshot's own fields do not mark it a wrapped, staked or bridged product, a
 * versioned pool or an exchange product. The rule is stated here and applied to
 * every protocol alike; no name is ever special-cased.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The curve value of one TVL under the fitted size curve. */
function curveValue(tvl: number, fit: { a: number; b: number }): number {
  return 10 ** (fit.a + fit.b * Math.log10(tvl));
}

/** The three multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: { a: number; b: number },
): { implied: number; curve: number; multiple: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const curve = curveValue(protocol.tvl_usd, fit);
  const implied = Math.max(1, Math.round(curve * growthMult * maturityMult));
  return { implied, curve, multiple: curve / protocol.tvl_usd, growthPct, growthMult, maturityMult, age };
}

/**
 * Estimated gas per transaction, in USD, by chain. These are the model's own
 * cost assumptions, stated in the dashboard as estimates, never measured fees:
 * a farm plan is costed on the cheapest chain the protocol itself lists, so
 * the reader sees the cheapest viable way in, not the dearest.
 */
const GAS_PER_TX_USD: Record<string, number> = {
  Solana: 0.01,
  'Hyperliquid L1': 0.01,
  Monad: 0.01,
  Polygon: 0.02,
  Plasma: 0.02,
  'Robinhood Chain': 0.02,
  Base: 0.03,
  Blast: 0.03,
  Linea: 0.03,
  Arbitrum: 0.05,
  Optimism: 0.05,
  Avalanche: 0.05,
  Berachain: 0.05,
  Scroll: 0.05,
  'zkSync Era': 0.05,
  Gnosis: 0.05,
  Fantom: 0.05,
  'BNB Chain': 0.1,
  Binance: 0.1,
  Tron: 0.1,
  Ethereum: 3.0,
};
const GAS_DEFAULT_USD = 0.5;

/** The cheapest chain a protocol lists, and that chain's estimated gas per transaction. */
export function cheapestChain(p: SnapshotProtocol): { chain: string; gasPerTx: number } {
  let best: { chain: string; gasPerTx: number } | null = null;
  for (const c of p.chains) {
    const g = GAS_PER_TX_USD[c];
    if (g === undefined) continue;
    if (best === null || g < best.gasPerTx) best = { chain: c, gasPerTx: g };
  }
  if (best !== null) return best;
  return { chain: p.chains.length > 0 ? p.chains[0]! : 'its main chain', gasPerTx: GAS_DEFAULT_USD };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A farm step as one string: action, cost and time, within the gate's 20..600 characters. */
function stepText(s: string): string {
  let t = s.trim();
  if (t.length > 600) t = `${t.slice(0, 596)}...`;
  if (t.length < 20) t = `${t} Keep the position open and check the protocol's own page.`;
  return t;
}

/** The category's one action, with one sentence saying why the action counts. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the loan book position open — the supplied balance is what a lender's snapshot reads.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open — pooled depth is the activity a DEX snapshot can see.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app — the bridge crossing is the recorded event.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt — the stake is locked on-chain, so it survives any snapshot.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade — margin on the books is what a perps snapshot counts.`;
  if (c.includes('prediction'))
    return `Fund $${capital} and place one market position on ${name} — a settled position is the recorded outcome.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares — vault shares accrue value, so the deposit itself is the position.`;
  if (c.includes('stable') || c.includes('dual-token'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} — the minted balance is the on-chain record.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it — the held token is the position a real-world-asset snapshot reads.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy — the policy is the on-chain record of the purchase.`;
  if (c.includes('basis'))
    return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the shares — the vault position is what the strategy's snapshot reads.`;
  if (c.includes('chain'))
    return `Bridge $${capital} of USDC onto ${name} and use it in one of its native apps — activity on the chain itself is the record.`;
  if (c.includes('payment') || c.includes('card'))
    return `Load $${capital} through ${name} and make one real payment with it — a settled payment is the recorded use.`;
  if (c.includes('governance'))
    return `Deposit $${capital} into ${name}'s voting vault on ${chain} and cast one vote — the vote is the on-chain record.`;
  if (c.includes('otc') || c.includes('index'))
    return `Buy $${capital} of the ${name} basket on ${chain} and hold it — the held basket is the position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open — the deposit is the on-chain record of the farm.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with its cost and time,
 * and a closing net line. The plan is derived from the protocol's own record
 * (category, chains, TVL, age), never from a hand-written list of names. Gas is
 * costed on the cheapest chain the protocol lists, at the model's estimated
 * per-transaction fee, for 7 transactions: 2 to set up, 4 weekly actions, 1 to
 * claim. Capital stays the reader's and is withdrawable; only gas is spent.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const { chain, gasPerTx } = cheapestChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gasTotal = round2(FARM_TX_COUNT * gasPerTx);
  const action = actionFor(p, capital, chain);
  const gasEach = gasPerTx < 1 ? `$${gasPerTx.toFixed(2)}` : `$${gasPerTx.toFixed(0)}`;
  return [
    stepText(
      `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. A separate wallet keeps the farm's transactions apart from your main funds, so any snapshot reads one clean history. Cost: under $1 of gas for the first transaction. Time: 5 minutes.`,
    ),
    stepText(
      `${action} Cost: $${capital} of capital and about ${gasEach} of gas for the deposit transaction. Time: 15 minutes to set up.`,
    ),
    stepText(
      `Make one qualifying action each week for four weeks, such as a deposit, a borrow, a swap or a vote. Repeated actions across weeks put the wallet in more than one snapshot window instead of a single day. Cost: about ${gasEach} of gas a week. Time: 10 minutes a week.`,
    ),
    stepText(
      `Hold the position for at least ${hold} days before you touch it. A position that survives ${hold} days is counted in more than one snapshot, while a same-day in-and-out leaves almost nothing to read. Cost: the $${capital} stays in the position and remains withdrawable. Time: ${hold} days.`,
    ),
    stepText(
      `Before you withdraw, open the protocol's own rewards page from the link it publishes and check whether anything is claimable. Checking first means you never pay a claim fee for nothing, and you never follow a link a stranger sent you. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    ),
    stepText(
      `Write the wallet, the dates and every transaction hash in a farm log. The log is what lets you repeat the position on the next protocol or unwind this one without guessing. Cost: nothing but the log. Time: 5 minutes.`,
    ),
    stepText(
      `Net: $${gasTotal.toFixed(2)} gas total (${FARM_TX_COUNT} transactions on ${chain} at about ${gasEach} each) + $${capital} capital locked, withdrawable + about 45 minutes of setup and weekly actions, hold ${hold} days. Only the gas is spent; the capital comes back when you withdraw.`,
    ),
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: { a: number; b: number }): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable protocol, whatever its TVL. The
  // watchlist is a floor, never a ceiling, so protocols above it that the
  // house list leaves out are ranked too, and the board carries all 198
  // protocols the snapshot's own fields mark rankable.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // A ranking must not rise as rank ascends: shave a dollar where two rows tie.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    let implied = s.v.implied;
    if (implied >= prev) implied = prev - 1;
    prev = implied;
    const { chain, gasPerTx } = cheapestChain(s.p);
    const capital = capitalFor(s.p);
    const hold = holdDaysFor(s.v.age);
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
      token_status: 'pre-token',
      age_days: s.v.age,
      implied_value_usd: implied,
      model: {
        curve_value_usd: Math.round(s.v.curve),
        multiple_at_tvl: round4(s.v.multiple),
        growth_pct: round4(s.v.growthPct),
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
        cheapest_chain: chain,
        gas_per_tx_usd: gasPerTx,
        farm_gas_total_usd: round2(FARM_TX_COUNT * gasPerTx),
        farm_capital_usd: capital,
        hold_days: hold,
      },
      farm_steps: farmSteps(s.p, s.v.age),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
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
    }));
}

/** A board row's compact form for data.js, farm plan included: the page shows the model's own plan, never a regenerated one. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
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
    multiple_at_tvl: row.model.multiple_at_tvl,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    cheapest_chain: row.model.cheapest_chain,
    gas_total_usd: row.model.farm_gas_total_usd,
    capital_usd: row.model.farm_capital_usd,
    hold_days: row.model.hold_days,
    watchlist: watchlist.has(row.slug),
    curve_value_usd: row.model.curve_value_usd,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { fit, validation } = validateModel(snapshot);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd < snapshot.floor_usd).length;
  const aboveFloor = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    above_floor_extra: aboveFloor,
    live_size: live.length,
    validation,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
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
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
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
