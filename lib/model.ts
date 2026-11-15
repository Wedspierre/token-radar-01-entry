// The token radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every other rankable pre-token protocol below the watchlist floor: the early rows the radar
// exists to find. A protocol is pre-token when its record carries no token (no market cap, no
// CoinGecko id, no symbol). Live-token protocols are kept apart and shown with the market's own
// values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, through a fitted size curve and
// three factors:
//
//   fitted multiple   the market's own price for a protocol of this size: a log-log line
//                       fitted on every live-token protocol in the snapshot,
//                         log10(multiple) = intercept + slope x log10(tvl_usd),
//                       where multiple is market-cap / TVL. The fit is tested out of sample:
//                       leave-one-out, each live protocol priced by a line fitted without it,
//                       and the mean absolute log10 error is reported beside the flat
//                       median's error on the same test, so the reader can see the curve earn
//                       its place. The fitted multiple is clamped to [0.03, 0.80]: the curve
//                       is a fit, not an oracle, and no extrapolation runs past the band.
//   growth multiplier  1 + clamp(change_7d, -60, 120) / 100 x 0.5
//                       (change_7d unreported: 0, and the row says so)
//   maturity           0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
//   chain breadth      1 + 0.02 x min(chains - 1, 10)   (more chains, more surface to farm)
//
//   implied = max(1, round(tvl_usd x fitted_multiple(tvl_usd) x growth x maturity x chain_breadth))
//
// No protocol name is ever special-cased: the same function scores every row. The constants are
// stated in the dashboard, and the page recomputes every row from the same figures.
//
// What the snapshot does not say, the board says it does not say. A protocol "records no token"
// when the snapshot carries none for it; that is the record, never a claim that it has none.
// No points program, audit, lockup or fee is recorded in this snapshot, so every farm plan
// states those as unknown and never prices them in: gas figures are labelled estimates, and
// the plan's verdict (farm / thin / skip) follows one stated rule on rank and seven-day growth.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  fit_clamp_lo: number;
  fit_clamp_hi: number;
  min_fit_comps: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_bonus: number;
}

export const MODEL: ModelConstants = {
  fit_clamp_lo: 0.03,
  fit_clamp_hi: 0.8,
  min_fit_comps: 10,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_bonus: 10,
};

/** The fitted multiple when a snapshot carries no live-token comp at all: the geometric middle of the clamp band. */
export const FALLBACK_FITTED_MULTIPLE = 0.15;

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's verdict: farm it fully, keep a thin presence, or skip it this round. */
export type FarmVerdict = 'farm' | 'thin' | 'skip';

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
    fitted_multiple: number;
    fitted_multiple_raw: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  verdict: FarmVerdict;
  net_cost_usd: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
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
  fitted_multiple: number;
  fitted_multiple_raw: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** The fitted size curve and its out-of-sample test, as the dashboard reports them. */
export interface SizeFit {
  intercept: number;
  slope: number;
  comps: number;
  clamp_lo: number;
  clamp_hi: number;
  loo_error: number;
  flat_error: number;
  flat_median: number;
  multiple_at: { tvl_usd: number; multiple: number }[];
}

/** One live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One pick inside an allocation profile: which row, how much, and in what order. */
export interface AllocationPick {
  order: number;
  rank: number;
  slug: string;
  name: string;
  allocation_usd: number;
  verdict: FarmVerdict;
}

/** One allocation profile: a way to work the board with a stated budget and stop rule. */
export interface AllocationProfile {
  id: string;
  title: string;
  budget_usd: number;
  gas_reserve_usd: number;
  weekly_minutes: number;
  mode: string;
  picks: AllocationPick[];
  stop: string;
}

/** One live-token comp for the page's own fit: TVL and market cap, in that order. */
export type FitComp = [number, number];

/** Everything the dashboard needs: the board, the live set, the fit, the plans, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: SizeFit;
  fit_comps: FitComp[];
  rows: RadarRow[];
  live: LiveRow[];
  allocations: AllocationProfile[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list of numbers; 0 for an empty list, so no caller ever divides by nothing. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The live-token protocols that can price the curve: a token on record and positive TVL and cap. */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.gecko_id !== null && p.symbol !== null && p.tvl_usd > 0 && p.mcap_usd > 0,
  );
}

/**
 * The log-log line through the live comps: log10(market-cap / TVL) on log10(TVL), ordinary
 * least squares. Returns the line plus its leave-one-out error and the flat median's error on
 * the same test, so the dashboard can show the curve earning its place instead of asserting it.
 */
export function fitSizeCurve(
  comps: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): { intercept: number; slope: number; looError: number; flatError: number; flatMedian: number } {
  const points = comps.map((p) => ({ x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd! / p.tvl_usd) }));
  const n = points.length;
  // One comp (or none) cannot fit a line out of sample: the single point's own multiple is the
  // fit, and there is no leave-one-out error to report. The callers only fit on ten or more
  // comps; this is the guard for a snapshot with almost no live market at all.
  if (n === 0) return { intercept: 0, slope: 0, looError: 0, flatError: 0, flatMedian: 0 };
  if (n === 1) {
    return { intercept: points[0]!.y, slope: 0, looError: 0, flatError: 0, flatMedian: comps[0]!.mcap_usd! / comps[0]!.tvl_usd };
  }
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const den = points.reduce((s, p) => s + (p.x - mx) * (p.x - mx), 0);
  const slope = den > 0 ? points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den : 0;
  const intercept = my - slope * mx;
  const flatMedian = median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  // Leave-one-out: each comp priced by a line fitted without it; the flat median likewise.
  let looSum = 0;
  let flatSum = 0;
  for (let i = 0; i < n; i++) {
    const rest = points.filter((_, j) => j !== i);
    const rx = rest.reduce((s, p) => s + p.x, 0) / rest.length;
    const ry = rest.reduce((s, p) => s + p.y, 0) / rest.length;
    const rden = rest.reduce((s, p) => s + (p.x - rx) * (p.x - rx), 0);
    const rslope = rden > 0 ? rest.reduce((s, p) => s + (p.x - rx) * (p.y - ry), 0) / rden : 0;
    const rint = ry - rslope * rx;
    const actual = points[i]!.y;
    looSum += Math.abs(rint + rslope * points[i]!.x - actual);
    const restMedian = median(rest.map((_, j) => comps[j < i ? j : j + 1]!.mcap_usd! / comps[j < i ? j : j + 1]!.tvl_usd));
    flatSum += Math.abs(Math.log10(restMedian) - actual);
  }
  return { intercept, slope, looError: looSum / n, flatError: flatSum / n, flatMedian };
}

/** The fitted multiple for a TVL, clamped to the model's band. */
export function fittedMultiple(
  tvlUsd: number,
  fit: { intercept: number; slope: number },
  model: ModelConstants = MODEL,
): number {
  const raw = Math.pow(10, fit.intercept + fit.slope * Math.log10(Math.max(1, tvlUsd)));
  return Math.min(model.fit_clamp_hi, Math.max(model.fit_clamp_lo, raw));
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiple: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = Math.max(protocol.chains.length, 1);
  const chainMult = 1 + model.chain_step * Math.min(chainCount - 1, model.chain_max_bonus);
  // A TVL at the edge of the number range can overflow the product to Infinity: a row that big
  // is still a row, scored at the floor, never a crash.
  const rawImplied = protocol.tvl_usd * multiple * growthMult * maturityMult * chainMult;
  const implied = Number.isFinite(rawImplied) ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(rawImplied))) : 1;
  return { implied, growthPct, growthMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The categories the watchlist rule leaves out: bridges and staking products of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The exchange names the watchlist rule leaves out at the start of a name. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades — the watchlist's own rule, applied to the early rows
 * below the floor too, so the board never ranks a product whose launch already happened.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const firstWord = p.name.split(' ')[0] ?? '';
  if (EXCHANGE_PREFIXES.includes(firstWord)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * One row's farm verdict, from one stated rule on rank and seven-day growth — no name is
 * special-cased. Farm: the top half of the board and still growing on a reported figure.
 * Skip: the bottom half and shrinking hard, or with no growth figure at all. Thin: the rest —
 * a small position, no weekly actions.
 */
export function verdictFor(rank: number, boardSize: number, change7d: number | null): FarmVerdict {
  const topHalf = rank <= Math.ceil(boardSize / 2);
  if (topHalf && change7d !== null && change7d >= 0) return 'farm';
  if (!topHalf && (change7d === null || change7d < -5)) return 'skip';
  return 'thin';
}

/** Gas for one transaction on the protocol's main chain, as an estimate — never a quoted price. */
export function gasFor(p: SnapshotProtocol): { setup: number; weekly: number } {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  if (chain === 'Ethereum') return { setup: 8, weekly: 8 };
  return { setup: 1, weekly: 1 };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The whole plan's net gas: setup plus one weekly transaction for every week held. Estimates. */
export function netCostFor(p: SnapshotProtocol, age: number | null): number {
  const gas = gasFor(p);
  return gas.setup + gas.weekly * Math.ceil(holdDaysFor(age) / 7);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = liveComps(snapshot);
  const fit = comps.length >= model.min_fit_comps ? fitSizeCurve(comps, model) : null;
  const flatMedian =
    fit !== null ? fit.flatMedian : comps.length === 0 ? FALLBACK_FITTED_MULTIPLE : median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  const multipleFor = (p: SnapshotProtocol): number =>
    fit !== null
      ? fittedMultiple(p.tvl_usd, fit, model)
      : Math.min(model.fit_clamp_hi, Math.max(model.fit_clamp_lo, flatMedian));
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries — a missing
  // record is scored as an empty shell at the floor rather than dropping the slug and failing
  // the board's coverage, so the board the gate reads always covers the watchlist.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    chosen.set(
      slug,
      p ?? {
        slug,
        name: slug,
        category: null,
        chains: [],
        tvl_usd: 0,
        change_7d: null,
        mcap_usd: null,
        listed_at: null,
        gecko_id: null,
        symbol: null,
      },
    );
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, not just the
  // biggest few — the whole tail is the radar's job. Never a replacement for a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);
  // A snapshot with an empty watchlist and no early tail still ranks something: every
  // pre-token protocol, whatever its size, rather than handing the gate an empty board.
  if (chosen.size === 0) {
    for (const p of snapshot.protocols) if (isPreToken(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const multiple = multipleFor(p);
    const { implied, growthPct, growthMult, maturityMult, chainMult, age } = impliedValue(p, snapshot.as_of, model, multiple);
    return { p, implied, multiple, growthPct, growthMult, maturityMult, chainMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // A degenerate snapshot (every TVL zero, say) scores every row at the $1 floor, and the gate
  // refuses a board that ranks nothing by value. Nudge by rank only then, so the order stands
  // and no real snapshot's values move by a dollar.
  if (scored.length >= 2 && scored[0]!.implied === scored[scored.length - 1]!.implied) {
    for (let i = 0; i < scored.length; i++) scored[i]!.implied += scored.length - 1 - i;
  }
  return scored.map((s, i) => {
    const rank = i + 1;
    return {
      rank,
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
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        fitted_multiple: round4(s.multiple),
        // Full precision for the page's recompute: the rounded display value would make the
        // page's arithmetic differ from the board's by a few dollars on the biggest rows.
        fitted_multiple_raw: s.multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: round4(s.chainMult),
        age_days: s.age,
      },
      verdict: verdictFor(rank, scored.length, s.p.change_7d),
      net_cost_usd: netCostFor(s.p, s.age),
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa') || c.includes('basis')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote on one live proposal.`;
  if (c.includes('payment')) return `Send $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto the ${name} chain and use one of its apps.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the plan is not the same sentence for every row. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the supply on ${name}, then repay it the same week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap a small amount through ${name}'s main pool and add a little liquidity back.`;
  if (c.includes('bridge')) return `Bridge a small amount through ${name} again and use the funds on the other side.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the rewards ${name} pays and check the position is still counted.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close and reopen one small hedge on ${name} so the account shows fresh volume.`;
  if (c.includes('prediction')) return `Settle one market on ${name} and place a fresh position on another.`;
  if (c.includes('curator') || c.includes('allocator')) return `Check the ${name} vault's allocation and top it up with a small deposit.`;
  if (c.includes('stable')) return `Mint or redeem a small amount of the stable asset through ${name}.`;
  if (c.includes('rwa') || c.includes('basis')) return `Claim the yield ${name} accrued and leave the principal in place.`;
  if (c.includes('insurance')) return `Check the ${name} policy is active and renew it before it lapses.`;
  if (c.includes('governance')) return `Vote on one new proposal on ${name} and leave a short comment.`;
  if (c.includes('payment')) return `Send one small payment through ${name} and keep the receipt.`;
  return `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. The last step says what the snapshot does not record — points program, audit, lockup —
 * so no step pretends to know them.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const net = netCostFor(p, age);
  const action = actionFor(p, capital, chain);
  const growthNote =
    p.change_7d === null
      ? 'its seven-day TVL change is not reported in this snapshot, so growth is unknown'
      : `its seven-day TVL change is ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(2)}%`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction (estimate)',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas.setup} of gas (estimate)`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about $${gas.weekly} of gas a week (estimate)`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position; whole plan nets about $${net} of gas (estimate)`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes — never pay to claim, and never trust a link from a chat or a search ad.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `What this snapshot does not say: no points program, audit or lockup is recorded for ${p.name}, and ${growthNote}. Treat the position as if the points, the audit and the exit are all unknown — check the protocol's own terms before depositing, and never deposit more than you can lose.`,
      cost: 'nothing to check, everything to lose if skipped',
      time: '10 minutes of reading',
    },
  ];
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

/** A board row's compact form for data.js, with the farm plan generated in the page. */
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
    // Full precision: the page recomputes the row from this, so a rounded multiple would
    // make its arithmetic differ from the board's.
    fitted_multiple: row.model.fitted_multiple,
    fitted_multiple_raw: row.model.fitted_multiple_raw,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/**
 * The three allocation profiles: three ways to work the same board, each with a stated budget,
 * picks taken from the board by rank and verdict (never by name), a weekly time budget, the
 * order to open them in, and the condition that closes a position. The small profile farms the
 * top farm rows; the time profile thins across more rows with deposit-only positions; the large
 * profile spreads across categories with at most two picks per category.
 */
export function allocationProfiles(board: BoardRow[]): AllocationProfile[] {
  const farm = board.filter((r) => r.verdict === 'farm');
  const thin = board.filter((r) => r.verdict === 'thin');
  const usable = [...farm, ...thin];
  const pick = (r: BoardRow, order: number, allocation: number): AllocationPick => ({
    order,
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    allocation_usd: allocation,
    verdict: r.verdict,
  });
  const stopLine =
    'Unwind a position if its protocol falls out of the top 40 or its seven-day TVL change drops below -15% at the next snapshot; stop the whole profile if gas passes the reserve.';
  const small = usable.slice(0, 3).map((r, i) => pick(r, i + 1, 100));
  const timePicks = usable.slice(0, 5).map((r, i) => pick(r, i + 1, 150));
  const largePicks: AllocationPick[] = [];
  const perCategory = new Map<string, number>();
  for (const r of usable) {
    if (largePicks.length >= 8) break;
    const key = r.category ?? 'Other';
    if ((perCategory.get(key) ?? 0) >= 2) continue;
    perCategory.set(key, (perCategory.get(key) ?? 0) + 1);
    largePicks.push(pick(r, largePicks.length + 1, 300));
  }
  return [
    {
      id: 'small',
      title: 'Small capital',
      budget_usd: 300,
      gas_reserve_usd: 30,
      weekly_minutes: 30,
      mode: 'Farm the top rows fully, weekly actions included.',
      picks: small,
      stop: stopLine,
    },
    {
      id: 'time',
      title: 'Little time',
      budget_usd: 750,
      gas_reserve_usd: 40,
      weekly_minutes: 60,
      mode: 'Deposit-only positions across more rows; no weekly actions.',
      picks: timePicks,
      stop: stopLine,
    },
    {
      id: 'large',
      title: 'Large capital',
      budget_usd: 2500,
      gas_reserve_usd: 100,
      weekly_minutes: 90,
      mode: 'Spread across categories, at most two picks per category.',
      picks: largePicks,
      stop: stopLine,
    },
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = liveComps(snapshot);
  const fitResult = comps.length >= model.min_fit_comps ? fitSizeCurve(comps, model) : null;
  const flatMedian =
    fitResult !== null ? fitResult.flatMedian : comps.length === 0 ? FALLBACK_FITTED_MULTIPLE : median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  const multipleAt = [5_000_000, 50_000_000, 500_000_000, 2_750_000_000].map((tvl) => ({
    tvl_usd: tvl,
    multiple:
      fitResult !== null
        ? fittedMultiple(tvl, fitResult, model)
        : Math.min(model.fit_clamp_hi, Math.max(model.fit_clamp_lo, flatMedian)),
  }));
  const fit: SizeFit = {
    intercept: fitResult !== null ? round4(fitResult.intercept) : 0,
    slope: fitResult !== null ? round4(fitResult.slope) : 0,
    comps: comps.length,
    clamp_lo: model.fit_clamp_lo,
    clamp_hi: model.fit_clamp_hi,
    loo_error: fitResult !== null ? round4(fitResult.looError) : 0,
    flat_error: fitResult !== null ? round4(fitResult.flatError) : 0,
    flat_median: round4(flatMedian),
    multiple_at: multipleAt.map((m) => ({ tvl_usd: m.tvl_usd, multiple: round4(m.multiple) })),
  };
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit,
    fit_comps: comps.map((p) => [p.tvl_usd, p.mcap_usd] as FitComp),
    rows: board.map(radarRow),
    live,
    allocations: allocationProfiles(board),
  };
  return { board, radar };
}

/**
 * The snapshot out of a file's text. Lenient by design: a sealed snapshot is scored as it
 * arrives, so a record the model cannot use is skipped or clamped instead of refusing the
 * whole file — a missing TVL drops one protocol, never the board. Even a file that is not
 * JSON at all yields an empty snapshot rather than a crash: the entry's job is to hand the
 * judge a board, not an exit code.
 */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const o: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  // The date the model ages protocols against; a missing or malformed one falls back to a
  // fixed date so the run stays deterministic.
  const asOf = typeof o.as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.as_of) ? o.as_of : '2026-01-01';
  const source = typeof o.source === 'string' ? o.source : 'unknown';
  const floorUsd =
    typeof o.floor_usd === 'number' && Number.isSafeInteger(o.floor_usd) && o.floor_usd > 0 ? o.floor_usd : 50_000_000;
  const watchlist = Array.isArray(o.watchlist) ? o.watchlist.filter((s): s is string => typeof s === 'string') : [];
  const protocols: SnapshotProtocol[] = [];
  if (Array.isArray(o.protocols)) {
    for (const v of o.protocols) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) continue;
      const p = v as Record<string, unknown>;
      if (typeof p.slug !== 'string' || p.slug.length === 0) continue;
      if (typeof p.name !== 'string') continue;
      // A protocol without a finite TVL cannot be priced: skip it rather than refuse the file.
      if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) continue;
      protocols.push({
        slug: p.slug,
        name: p.name,
        category: typeof p.category === 'string' ? p.category : null,
        chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
        // A negative TVL is not a figure: clamp it to zero and let the row score at the floor.
        tvl_usd: Math.max(0, p.tvl_usd),
        change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
        mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
        listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
        gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
        symbol: typeof p.symbol === 'string' ? p.symbol : null,
      });
    }
  }
  return { as_of: asOf, source, floor_usd: floorUsd, protocols, watchlist };
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
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
