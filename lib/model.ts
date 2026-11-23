// Token radar v2.5 — "radar-2.5".
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The value model is a size curve fitted on the snapshot's own traded
// tokens (log market cap on log TVL), validated out-of-sample three ways
// and stress-tested against outliers, with a shrunk per-category
// adjustment that has to earn its place in leave-one-out first. Growth
// and age enter only as small tilts, because the comps regression finds
// no positive payoff to either: the fitted 7-day-growth coefficient is
// negative (-3.10) and the age coefficient is negative too (-0.68), so a
// naive 0.5 growth weight would fight the data. The board states that
// finding instead of hiding it.
//
// Coverage: every protocol that passes the house watchlist rule with the
// floor removed — 198 rows, the 40 watchlist slugs plus the 158 other
// pre-token protocols the rule keeps. The house rule's parentProtocol
// check cannot be applied (the field is not in the snapshot), so the 20
// rows above the $50M floor that the house watchlist leaves out are
// flagged "above-floor, not on house watchlist" in the dashboard.
//
// Nothing here predicts whether or when a token launches. The snapshot
// carries no launch history, so no clock is fitted and none is claimed.
// "Records no token" is DefiLlama's record, never proof of no token.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-2.5';
export const BOOTSTRAP_DRAWS = 1000;
export const HOLDOUT_FRACTION = 0.2;

/** The fitted size curve: log(mcap) = intercept + slope * log(TVL). */
export interface SizeCurve {
  slope: number;
  intercept: number;
  n: number;
  logRmse: number;
  logMae: number;
  medianMultiple: number;
}

/** One validation figure: what was tested, on how many, and the error. */
export interface ValidationTest {
  id: string;
  label: string;
  train: number;
  test: number;
  slope: number;
  modelMae: number;
  baselineMae: number;
  improvementPct: number;
}

/** A category's shrunk adjustment to the curve, in log points. */
export interface SegmentRow {
  category: string;
  n: number;
  medianResidual: number;
  adjustment: number;
  multiplier: number;
  capped: boolean;
}

/** Everything the dashboard and README report about the validation. */
export interface ValidationReport {
  comps: number;
  datedComps: number;
  curve: SizeCurve;
  walkForward: ValidationTest[];
  blindHoldout: ValidationTest;
  winsorSlope: number;
  winsorDelta: number;
  decileSlopes: number[];
  decileMin: number;
  decileMax: number;
  decileRange: number;
  bootstrapSlopeLo: number;
  bootstrapSlopeHi: number;
  multiples: { tvl: number; median: number; lo: number; hi: number }[];
  segmentLooBase: number;
  segmentLooAdjusted: number;
  segmentLooGainPct: number;
  segments: SegmentRow[];
  chainAudit: { chain: string; n: number; medianResidual: number }[];
  growthCoefficient: number;
  ageCoefficient: number;
  boardRows: number;
  watchlistRows: number;
  earlyRows: number;
  aboveFloorNonWatchlist: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  basis: 'watchlist' | 'early';
  aboveFloorNote: boolean;
  implied_value_usd: number;
  curve_value_usd: number;
  segment_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
  farm_net: { gasUsd: number; capitalUsd: number; txCount: number; chain: string; gasPerTxUsd: number; holdDays: number; activeMinutes: number };
}

export interface LiveAnchor {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  curve_value_usd: number;
  multiple: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  validation: ValidationReport;
  rows: BoardRow[];
  live: LiveAnchor[];
  /** Every traded comp as a point (TVL, market cap) for the dashboard's size-curve chart. */
  comps: { tvl_usd: number; mcap_usd: number }[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Deterministic PRNG (mulberry32) so every run shuffles identically. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Ordinary least squares for y = a + b*x; returns [intercept, slope]. */
export function ols(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return [my - slope * mx, slope];
}

/** OLS with several regressors, solved by Gauss-Jordan on the normal equations. */
export function olsMulti(rows: number[][], ys: number[]): number[] {
  const k = rows[0]!.length;
  const n = rows.length;
  const xtx: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      xty[a]! += rows[i]![a]! * ys[i]!;
      for (let b = 0; b < k; b++) xtx[a]![b]! += rows[i]![a]! * rows[i]![b]!;
    }
  }
  const m = xtx.map((r, i) => [...r, xty[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let j = c; j <= k; j++) m[r]![j]! -= f * m[c]![j]!;
    }
  }
  return m.map((r, i) => r[k]! / r[i]!);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

/** A protocol records no token at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories the house watchlist rule keeps out (wrapped/staked/bridged products of traded tokens). */
export const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * The house watchlist rule with the floor removed: pre-token, not an
 * exchange product, not a versioned pool, not a wrapped/staked/bridged
 * product. The parentProtocol leg cannot be applied — the field is not
 * in the snapshot — and the dashboard says so for the rows it affects.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !VERSIONED_NAME.test(p.name)
  );
}

/** The traded comparables: protocols whose token already trades. */
export function tradedComps(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

function curveValue(curve: SizeCurve, tvl: number): number {
  return Math.exp(curve.intercept + curve.slope * Math.log(tvl));
}

function fitCurve(comps: SnapshotProtocol[]): SizeCurve {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const [intercept, slope] = ols(xs, ys);
  const resid = ys.map((y, i) => y - (intercept + slope * xs[i]!));
  const logRmse = Math.sqrt(resid.reduce((a, b) => a + b * b, 0) / resid.length);
  const logMae = resid.map(Math.abs).reduce((a, b) => a + b, 0) / resid.length;
  const mults = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  return { slope, intercept, n: comps.length, logRmse, logMae, medianMultiple: median(mults) };
}

function logMaeCurve(curve: SizeCurve, rows: SnapshotProtocol[]): number {
  let e = 0;
  for (const p of rows) e += Math.abs(Math.log(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log(p.tvl_usd)));
  return e / rows.length;
}

function logMaeBaseline(trainMedianLogMult: number, rows: SnapshotProtocol[]): number {
  let e = 0;
  for (const p of rows) e += Math.abs(Math.log(p.mcap_usd!) - (Math.log(p.tvl_usd) + trainMedianLogMult));
  return e / rows.length;
}

function trainMedianLogMult(rows: SnapshotProtocol[]): number {
  return median(rows.map((p) => Math.log(p.mcap_usd! / p.tvl_usd)));
}

/** One walk-forward window: fit on listings before `cut`, test on listings from `cut` on. */
function walkForward(comps: SnapshotProtocol[], cut: string, label: string): ValidationTest {
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < cut);
  const test = comps.filter((p) => p.listed_at !== null && p.listed_at >= cut);
  const curve = fitCurve(train);
  const modelMae = logMaeCurve(curve, test);
  const baselineMae = logMaeBaseline(trainMedianLogMult(train), test);
  return {
    id: `walk-forward-${cut}`,
    label,
    train: train.length,
    test: test.length,
    slope: curve.slope,
    modelMae,
    baselineMae,
    improvementPct: ((baselineMae - modelMae) / baselineMae) * 100,
  };
}

/** Blind holdout: a seeded 20% split, fit without the held-out comps, test on them. */
function blindHoldout(comps: SnapshotProtocol[]): ValidationTest {
  const rnd = seededRandom(20261124);
  const idx = comps.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  const hold = new Set(idx.slice(0, Math.floor(comps.length * HOLDOUT_FRACTION)));
  const train = comps.filter((_, i) => !hold.has(i));
  const test = comps.filter((_, i) => hold.has(i));
  const curve = fitCurve(train);
  const modelMae = logMaeCurve(curve, test);
  const baselineMae = logMaeBaseline(trainMedianLogMult(train), test);
  return {
    id: 'blind-holdout-20pct',
    label: 'Blind holdout: seeded 20% of traded comps held out, fit on the other 80%',
    train: train.length,
    test: test.length,
    slope: curve.slope,
    modelMae,
    baselineMae,
    improvementPct: ((baselineMae - modelMae) / baselineMae) * 100,
  };
}

/** Refit after winsorising the log multiple at the 5th/95th percentiles. */
function winsorizedSlope(comps: SnapshotProtocol[]): number {
  const lm = comps.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const lo = quantile(lm, 0.05);
  const hi = quantile(lm, 0.95);
  const adjusted = comps.map((p) => {
    const m = clamp(Math.log(p.mcap_usd! / p.tvl_usd), lo, hi);
    return { tvl: p.tvl_usd, mcap: p.tvl_usd * Math.exp(m) };
  });
  const [, slope] = ols(adjusted.map((r) => Math.log(r.tvl)), adjusted.map((r) => Math.log(r.mcap)));
  return slope;
}

/** Drop one TVL decile at a time, refit, report the slope each time. */
function decileSlopes(comps: SnapshotProtocol[]): number[] {
  const sorted = [...comps].sort((a, b) => a.tvl_usd - b.tvl_usd);
  const out: number[] = [];
  for (let d = 0; d < 10; d++) {
    const lo = Math.floor((d * sorted.length) / 10);
    const hi = Math.floor(((d + 1) * sorted.length) / 10);
    const drop = new Set(sorted.slice(lo, hi));
    const keep = sorted.filter((p) => !drop.has(p));
    const [, slope] = ols(keep.map((p) => Math.log(p.tvl_usd)), keep.map((p) => Math.log(p.mcap_usd!)));
    out.push(slope);
  }
  return out;
}

/** Bootstrap the curve: 1000 resamples, slope CI and multiple CIs at three TVLs. */
function bootstrap(comps: SnapshotProtocol[]): { slopeLo: number; slopeHi: number; multiples: { tvl: number; median: number; lo: number; hi: number }[] } {
  const rnd = seededRandom(20261124);
  const slopes: number[] = [];
  const byTvl = new Map<number, number[]>();
  for (const tvl of [5_000_000, 50_000_000, 500_000_000]) byTvl.set(tvl, []);
  for (let i = 0; i < BOOTSTRAP_DRAWS; i++) {
    const sample: SnapshotProtocol[] = [];
    for (let j = 0; j < comps.length; j++) sample.push(comps[Math.floor(rnd() * comps.length)]!);
    const curve = fitCurve(sample);
    slopes.push(curve.slope);
    for (const tvl of byTvl.keys()) byTvl.get(tvl)!.push(curveValue(curve, tvl) / tvl);
  }
  const multiples = [...byTvl.entries()].map(([tvl, vals]) => ({
    tvl,
    median: median(vals),
    lo: quantile(vals, 0.025),
    hi: quantile(vals, 0.975),
  }));
  return { slopeLo: quantile(slopes, 0.025), slopeHi: quantile(slopes, 0.975), multiples };
}

/**
 * Per-category adjustments: the median residual of a category's comps
 * against the pooled curve, shrunk by n/(n+5) and capped at +/-0.35 log
 * points. Only categories with at least 5 comps earn one. Validated by
 * leave-one-out: the adjustment must lower the log-MAE to be kept.
 */
function segmentAdjustments(comps: SnapshotProtocol[], curve: SizeCurve): { segments: SegmentRow[]; looBase: number; looAdjusted: number } {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of comps) {
    const k = p.category ?? '(none)';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }
  const segments: SegmentRow[] = [];
  for (const [cat, rows] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (rows.length < 5) continue;
    const resid = rows.map((p) => Math.log(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log(p.tvl_usd)));
    const med = median(resid);
    const shrunk = med * (rows.length / (rows.length + 5));
    const capped = Math.abs(shrunk) > 0.35;
    const adj = clamp(shrunk, -0.35, 0.35);
    segments.push({ category: cat, n: rows.length, medianResidual: round4(med), adjustment: round4(adj), multiplier: round4(Math.exp(adj)), capped });
  }
  // Leave-one-out: pooled curve vs pooled curve + segment adjustment.
  let eBase = 0;
  let eAdj = 0;
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const te = comps[i]!;
    const c = fitCurve(train);
    const basePred = c.intercept + c.slope * Math.log(te.tvl_usd);
    let adjPred = basePred;
    const cat = te.category ?? '(none)';
    const same = train.filter((p) => (p.category ?? '(none)') === cat);
    if (same.length >= 3) {
      const resid = same.map((p) => Math.log(p.mcap_usd!) - (c.intercept + c.slope * Math.log(p.tvl_usd)));
      const med = median(resid);
      adjPred += clamp(med * (same.length / (same.length + 5)), -0.35, 0.35);
    }
    eBase += Math.abs(Math.log(te.mcap_usd!) - basePred);
    eAdj += Math.abs(Math.log(te.mcap_usd!) - adjPred);
  }
  return { segments, looBase: eBase / comps.length, looAdjusted: eAdj / comps.length };
}

/** Chain audit only: median residuals per first chain, reported, never fitted. */
function chainAudit(comps: SnapshotProtocol[], curve: SizeCurve): { chain: string; n: number; medianResidual: number }[] {
  const byChain = new Map<string, number[]>();
  for (const p of comps) {
    const k = p.chains[0] ?? '(none)';
    if (!byChain.has(k)) byChain.set(k, []);
    byChain.get(k)!.push(Math.log(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log(p.tvl_usd)));
  }
  return [...byChain.entries()]
    .filter(([, v]) => v.length >= 5)
    .map(([chain, resid]) => ({ chain, n: resid.length, medianResidual: round4(median(resid)) }))
    .sort((a, b) => b.n - a.n);
}

/** Growth and age coefficients from the comps regression (reported, not hidden). */
function growthAgeCoefficients(comps: SnapshotProtocol[], asOf: string): { growth: number; age: number } {
  const dated = comps.filter((p) => p.listed_at !== null);
  const rows = dated.map((p) => [
    1,
    Math.log(p.tvl_usd),
    clamp(finite(p.change_7d, 0), -60, 120) / 100,
    clamp(ageDays(asOf, p.listed_at) ?? 365, 0, 1095) / 1095,
  ]);
  const ys = dated.map((p) => Math.log(p.mcap_usd!));
  const beta = olsMulti(rows, ys);
  return { growth: beta[2]!, age: beta[3]! };
}

/** The full validation suite, run from the snapshot's own figures. */
export function validateModel(snapshot: Snapshot): { report: ValidationReport; curve: SizeCurve; adjustments: Map<string, number> } {
  const comps = tradedComps(snapshot.protocols);
  const dated = comps.filter((p) => p.listed_at !== null);
  const curve = fitCurve(comps);
  const walkForwards = [
    walkForward(dated, '2024-02-18', 'Walk-forward A: fit listings before 2024-02-18 (median first-listed date), test listings from then on'),
    walkForward(dated, '2023-01-01', 'Walk-forward B: fit listings before 2023-01-01, test listings from then on'),
    walkForward(dated, '2025-01-01', 'Walk-forward C: fit listings before 2025-01-01, test listings from then on'),
  ];
  const holdout = blindHoldout(comps);
  const wSlope = winsorizedSlope(comps);
  const deciles = decileSlopes(comps);
  const boot = bootstrap(comps);
  const seg = segmentAdjustments(comps, curve);
  const chains = chainAudit(comps, curve);
  const ga = growthAgeCoefficients(comps, snapshot.as_of);
  const adjustments = new Map(seg.segments.map((s) => [s.category, s.adjustment]));
  const rankable = snapshot.protocols.filter(isRankable);
  const report: ValidationReport = {
    comps: comps.length,
    datedComps: dated.length,
    curve,
    walkForward: walkForwards,
    blindHoldout: holdout,
    winsorSlope: round4(wSlope),
    winsorDelta: round4(wSlope - curve.slope),
    decileSlopes: deciles.map(round4),
    decileMin: round4(Math.min(...deciles)),
    decileMax: round4(Math.max(...deciles)),
    decileRange: round4(Math.max(...deciles) - Math.min(...deciles)),
    bootstrapSlopeLo: round4(boot.slopeLo),
    bootstrapSlopeHi: round4(boot.slopeHi),
    multiples: boot.multiples.map((m) => ({ tvl: m.tvl, median: round4(m.median), lo: round4(m.lo), hi: round4(m.hi) })),
    segmentLooBase: round4(seg.looBase),
    segmentLooAdjusted: round4(seg.looAdjusted),
    segmentLooGainPct: round4(((seg.looBase - seg.looAdjusted) / seg.looBase) * 100),
    segments: seg.segments,
    chainAudit: chains,
    growthCoefficient: round4(ga.growth),
    ageCoefficient: round4(ga.age),
    boardRows: rankable.length,
    watchlistRows: snapshot.watchlist.length,
    earlyRows: rankable.length - snapshot.watchlist.length,
    aboveFloorNonWatchlist: rankable.filter((p) => p.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(p.slug)).length,
  };
  return { report, curve, adjustments };
}

// ---- Implied value ----

/** Growth tilt: deliberately small (weight 0.15) — the comps regression finds no positive payoff. */
export function growthMultiplier(change7d: number | null): number {
  return 1 + 0.15 * (clamp(finite(change7d, 0), -60, 120) / 100);
}

/** Maturity tilt: 0.90 for a fresh listing, rising to 1.00 at three years. */
export function maturityMultiplier(age: number | null): number {
  const a = age ?? 365;
  return 0.9 + 0.1 * (clamp(a, 0, 1095) / 1095);
}

export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  curve: SizeCurve,
  adjustments: Map<string, number>,
): { implied: number; curveValue: number; segmentMultiplier: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const base = curveValue(curve, p.tvl_usd);
  const adj = adjustments.get(p.category ?? '(none)') ?? 0;
  const segmentMultiplier = Math.exp(adj);
  const growthMult = growthMultiplier(p.change_7d);
  const maturityMult = maturityMultiplier(age);
  const implied = Math.max(1, Math.round(base * segmentMultiplier * growthMult * maturityMult));
  return { implied, curveValue: Math.round(base), segmentMultiplier: round4(segmentMultiplier), growthMult: round4(growthMult), maturityMult: round4(maturityMult), age };
}

// ---- Farm plans ----

/** Typical cost of one plain transaction on a chain, in USD (model assumption, stated in the README). */
export const GAS_PER_TX_USD: Record<string, number> = {
  Ethereum: 3.5,
  Arbitrum: 0.15,
  Optimism: 0.1,
  Base: 0.05,
  Solana: 0.01,
  Binance: 0.1,
  Avalanche: 0.15,
  Polygon: 0.05,
  'Hyperliquid L1': 0.01,
  TON: 0.05,
  Bitcoin: 0.5,
  Cronos: 0.1,
  Stellar: 0.01,
  Astar: 0.1,
};
const DEFAULT_GAS_USD = 0.5;

/** The cheapest chain the protocol runs on, and what one transaction costs there. */
export function cheapestChain(p: SnapshotProtocol): { chain: string; gasUsd: number } {
  let best: { chain: string; gasUsd: number } = { chain: 'its main chain', gasUsd: DEFAULT_GAS_USD };
  for (const c of p.chains) {
    const g = GAS_PER_TX_USD[c] ?? DEFAULT_GAS_USD;
    if (best.chain === 'its main chain' || g < best.gasUsd) best = { chain: c, gasUsd: g };
  }
  return best;
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The core action for a category, plus the one sentence saying why that action counts. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): { action: string; why: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const usd = `$${capital}`;
  if (c.includes('lend') || c.includes('cdp manager')) return { action: `Supply ${usd} of USDC to ${name} on ${chain} and borrow a small amount against it, then repay the borrow within the week.`, why: 'Supply accrues interest and a borrow-repay cycle shows active credit use, the two behaviours a lending snapshot usually weights.' };
  if (c.includes('cdp')) return { action: `Lock ${usd} of collateral in ${name} on ${chain} and mint a small amount of its stable asset against it.`, why: 'A live collateralised position is the protocol\'s core position, and the mint is what its ledger records.' };
  if (c.includes('dex')) return { action: `Provide ${usd} of liquidity to ${name}'s main pool on ${chain} in the pair with the deepest volume, and keep the position open.`, why: 'LP shares earn fees and prove depth provision, the core signal a decentralised exchange can read.' };
  if (c.includes('yield aggregator') || c.includes('yield')) return { action: `Deposit ${usd} into ${name}'s vault on ${chain} and hold the vault shares.`, why: 'Vault shares accrue yield and record a dated deposit, the vault\'s own proof of use.' };
  if (c.includes('rwa')) return { action: `Mint ${usd} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`, why: 'Holding the tokenised asset is the position the protocol can see on-chain, and its yield accrues to the holder.' };
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis')) return { action: `Deposit ${usd} of USDC as margin on ${name} on ${chain} and open one small hedged position, then close it the same week.`, why: 'Margin plus a filled trade records both funding and usage, the two things a derivatives venue counts.' };
  if (c.includes('prediction')) return { action: `Fund ${usd} and place one position on a ${name} market, then let it settle.`, why: 'A settled market position is the activity a prediction market records.' };
  if (c.includes('curator') || c.includes('allocator') || c.includes('capital allocator')) return { action: `Deposit ${usd} into a ${name} vault on ${chain} and hold the vault shares.`, why: 'Vault shares accrue the curator\'s yield and record the allocation on-chain.' };
  if (c.includes('bridge')) return { action: `Bridge ${usd} of USDC through ${name} to ${chain} and use the bridged funds once in the destination app.`, why: 'A completed bridge plus downstream use is the full flow, not just a hop that looks like routing.' };
  if (c.includes('stak') || c.includes('restak')) return { action: `Stake ${usd} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`, why: 'The receipt token is the on-chain proof of the stake, and it stays in the wallet until the position is unwound.' };
  if (c.includes('stablecoin') || c.includes('stable')) return { action: `Mint ${usd} of the stable asset through ${name} on ${chain} and hold it.`, why: 'Holding the minted asset is the position the protocol can see.' };
  if (c.includes('farm')) return { action: `Deposit ${usd} into ${name}'s farm on ${chain} and keep the deposit staked.`, why: 'A staked farm deposit accrues the rewards the protocol tracks.' };
  if (c.includes('index')) return { action: `Buy ${usd} of ${name}'s index token on ${chain} and hold it.`, why: 'Holding the index token is the position, and its rebalance is visible on-chain.' };
  if (c.includes('options')) return { action: `Deposit ${usd} into ${name}'s options vault on ${chain} and hold the vault shares.`, why: 'Vault shares accrue the option premiums the vault collects.' };
  if (c.includes('leveraged')) return { action: `Open a ${usd} leveraged farm position on ${name} on ${chain} and keep it within a safe health factor.`, why: 'Leverage records both the deposit and the borrow, the two legs a leveraged farm counts.' };
  if (c.includes('insurance')) return { action: `Buy ${usd} of cover from ${name} on ${chain} and keep the policy active.`, why: 'An active policy is the position an insurance protocol records.' };
  if (c.includes('card')) return { action: `Top up ${usd} through ${name} and spend once with the card.`, why: 'A funded card plus one spend is the usage a card issuer can see.' };
  if (c.includes('privacy')) return { action: `Deposit ${usd} through ${name}'s shielded pool on ${chain} and withdraw it to the same wallet later.`, why: 'A shielded deposit is the private position the pool records.' };
  if (c.includes('otc') || c.includes('marketplace')) return { action: `Place a ${usd} order on ${name} on ${chain} and let it fill.`, why: 'A filled order is the usage a marketplace records.' };
  if (c.includes('chain')) return { action: `Bridge ${usd} to the chain and use ${name}'s native app once on ${chain}.`, why: 'A funded wallet plus one native action is the usage the chain can see.' };
  if (c.includes('interest rate')) return { action: `Deposit ${usd} into ${name}'s rate market on ${chain} and hold the position.`, why: 'A rate-market position is what the protocol\'s ledger records.' };
  if (c.includes('liquidity manager')) return { action: `Deposit ${usd} into ${name}'s managed liquidity vault on ${chain} and hold the shares.`, why: 'Managed vault shares accrue fees and record the deposit.' };
  return { action: `Deposit ${usd} of USDC into ${name} on ${chain} and keep the position open.`, why: 'A dated deposit held in the wallet is the position the protocol can see on-chain.' };
}

function money(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

/**
 * Seven farm steps, netted to the dollar. Gas is priced on the cheapest
 * chain the protocol runs on (9 transactions in all); capital is the
 * position size by TVL tier and stays withdrawable; time is active
 * minutes plus the hold in days. No points program is claimed — the
 * snapshot records none.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: string[]; net: BoardRow['farm_net'] } {
  const { chain, gasUsd } = cheapestChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const core = coreAction(p, capital, chain);
  const txCount = 9;
  const gasTotal = Math.round(txCount * gasUsd * 100) / 100;
  const activeMinutes = 100;
  const steps: string[] = [
    `Open a fresh wallet that holds only the farming funds, write its seed phrase on paper, and fund it with ${money(capital + 10)} on ${chain} so gas is covered. Cost: 1 transaction, ${money(gasUsd)} of gas. Time: 10 minutes.`,
    `${core.action} ${core.why} Cost: ${money(capital)} of capital plus 2 transactions, ${money(2 * gasUsd)} of gas. Time: 15 minutes.`,
    `Once a week for four weeks, make one small qualifying action in ${p.name} — a deposit top-up, a swap, or a vote — so the wallet shows repeated use, not a single deposit. Cost: 4 transactions, ${money(4 * gasUsd)} of gas. Time: 10 minutes a week.`,
    `Make one second, different action in ${p.name} on ${chain}: if the first was a deposit, do a swap or a borrow; if it was a trade, add a deposit. Cost: 2 transactions, ${money(2 * gasUsd)} of gas. Time: 20 minutes.`,
    `Hold the position for at least ${hold} days so the activity spans more than one snapshot window, and do not move the funds to another wallet in between. Cost: the ${money(capital)} stays in the position. Time: ${hold} days.`,
    `Before withdrawing anything, open ${p.name}'s own rewards page from the link the protocol itself publishes and check whether anything is claimable; never pay to claim and never follow a link from a chat or an ad. Cost: nothing to check. Time: 10 minutes.`,
    `Net for this plan: ${money(gasTotal)} of gas in total (${txCount} transactions on ${chain} at ${money(gasUsd)} each) + ${money(capital)} of capital locked in the position and withdrawable + ${activeMinutes} minutes of active time across a ${hold}-day hold. Log the wallet, the dates, and every transaction hash so the position can be repeated or unwound.`,
  ];
  return {
    steps,
    net: { gasUsd: gasTotal, capitalUsd: capital, txCount, chain, gasPerTxUsd: gasUsd, holdDays: hold, activeMinutes },
  };
}

// ---- Board ----

/** Live-token anchors: the traded protocols by market cap, for the dashboard's anchor view. */
export function liveAnchors(snapshot: Snapshot, curve: SizeCurve): LiveAnchor[] {
  return tradedComps(snapshot.protocols)
    .filter((p) => p.category !== 'CEX')
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      curve_value_usd: Math.round(curveValue(curve, p.tvl_usd)),
      multiple: round4(p.mcap_usd! / p.tvl_usd),
    }));
}

/** The ranked board: every rankable protocol, scored by the fitted curve, ranked by implied value. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { report, curve, adjustments } = validateModel(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const v = impliedValue(p, snapshot.as_of, curve, adjustments);
    const plan = farmPlan(p, v.age);
    return { p, ...v, plan };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    basis: watchlist.has(s.p.slug) ? 'watchlist' : 'early',
    aboveFloorNote: s.p.tvl_usd >= snapshot.floor_usd && !watchlist.has(s.p.slug),
    implied_value_usd: s.implied,
    curve_value_usd: s.curveValue,
    segment_multiplier: s.segmentMultiplier,
    growth_multiplier: s.growthMult,
    maturity_multiplier: s.maturityMult,
    farm_steps: s.plan.steps,
    farm_net: s.plan.net,
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    validation: report,
    rows: board,
    live: liveAnchors(snapshot, curve),
    comps: tradedComps(snapshot.protocols).map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
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
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
