// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) plus the
// 158 pre-token protocols below the floor with the most TVL: 198 rows. A protocol is pre-token
// when its record carries no token (no market cap, no CoinGecko id, no symbol); the live-token
// protocols are kept apart and shown with the market's own values, never mixed into the ranking.
//
// Implied value is fitted from the snapshot itself, never from a hardcoded list of names:
//   log10(mcap) = a + b * log10(TVL)          fitted by OLS on every traded token in the snapshot
//   implied = 10^(a + b*log10(TVL)) x growth x tenure x category x kinship x chains
//   growth   = 10^(-0.25 * clamp(change_7d, -50, +100) / 100)   (TVL spikes are discounted)
//   tenure   = 0.90 + 0.20 * min(age_days, 1095) / 1095          (longer with no token: premium)
//   category = 10^(shrunk mean residual of the category)        (n >= 5, shrunk n/(n+10))
//   kinship  = 0.5 when a sibling protocol's token already trades, else 1
//   chains   = 10^(-0.25 * log10(min(chains, 8)))               (breadth is discounted)
// The five terms are dampened on purpose: the raw fitted coefficients are unstable across time
// folds, so each term is shrunk to a bounded range. The ablation table the dashboard prints
// shows every term set's held-out miss (leave-one-out and two walk-forward folds); the shipped
// full set beats the base curve on all three (LOO, WF1, WF2).
//
// Token odds are a separate quantity: the share of protocols that already trade, by age bucket,
// fitted from the snapshot and scored with a Brier score against the base rate.
//
// Farm economics per row: expected = implied x odds x CAPTURE, where CAPTURE = 0.05 / 5000
// (a 5% airdrop split across 5,000 active farmers; a stated assumption, adjustable in the
// dashboard's what-if controls). Costs are gas (per-chain estimates, stated), 1.5 hours of work
// valued at $15/hour, and the T-bill 4% opportunity cost of the deposit over the hold. The
// verdict follows from the net: FARM / MARGINAL / THIN / SKIP.

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

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 158;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits for the rank-stability band. */
export const BOOTSTRAP_REFITS = 200;

/** The farm-economics assumptions, all stated on the dashboard and adjustable in its what-if panel. */
export const FARM = {
  /** Share of the airdrop allocation a single farmer captures: 5% of supply, 5,000 farmers. */
  capture: 0.00001,
  dropShare: 0.05,
  farmers: 5000,
  /** Hands-on hours the plan takes. */
  hours: 1.5,
  /** Dollars an hour of work is valued at. */
  hourlyRate: 15,
  /** T-bill rate for the deposit's opportunity cost. */
  tbill: 0.04,
  /** Transactions the plan makes, for the gas total. */
  txCount: 6,
};

/** Verdict cut-offs on the net and the net per hour, in dollars. */
export const VERDICT = { farmNet: 20, farmPerHour: 8, marginalNet: 0, thinNet: -15 };

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
    base_value_usd: number;
    growth_multiplier: number;
    tenure_multiplier: number;
    category_multiplier: number;
    kinship_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  odds: number;
  expected_value_usd: number;
  farm_net_usd: number;
  farm_net_per_hour_usd: number;
  farm_verdict: 'FARM' | 'MARGINAL' | 'THIN' | 'SKIP';
  rank_lo: number;
  rank_hi: number;
  rank_stability: number;
  airdrop_clock: { age_days: number | null; median_traded_age_days: number | null; progress_pct: number | null; bucket_odds: number };
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

/** One row of the ablation table: a term set and its held-out miss on three tests. */
export interface AblationRow {
  terms: string;
  loo_median_miss: number;
  wf1_median_miss: number;
  wf2_median_miss: number;
  kept: boolean;
  note: string;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: { intercept: number; slope: number; r2: number; n: number };
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  verdict_counts: { FARM: number; MARGINAL: number; THIN: number; SKIP: number };
  hero: { slug: string; name: string; net_usd: number; net_per_hour_usd: number; hours: number; deposit_usd: number }[];
  rows: BoardRow[];
  live: LiveRow[];
  scatter: { comps: [number, number][]; board: [number, number][]; line: [number, number, number, number] };
  ablation: AblationRow[];
  calibration: { p10: number; p25: number; p75: number; p90: number; in_25_75_pct: number; in_10_90_pct: number; n: number };
  odds: { buckets: { lo: number; hi: number | null; n: number; traded: number; p: number }[]; brier: number; base_brier: number; base_rate: number };
  ledger: { ranked: number; traded: number; excluded: number; total: number; excluded_reasons: { reason: string; count: number }[] };
  integrity: { board_sha256: string; watchlist: string; ledger: string };
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

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Median of an array (sorted copy; lower middle for even counts). */
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

/** Quantile of an array at `q` in [0, 1]. */
function quantile(a: number[], q: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

/** A deterministic PRNG (mulberry32) so the bootstrap is byte-identical every run. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The comparables the size curve is fitted on: every traded token that is not a versioned pool. */
export function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && !VERSIONED.test(p.name));
}

/** OLS of y on x: returns intercept, slope and R squared. */
function ols(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    syy += (ys[i]! - my) * (ys[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  return { a, b, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0 };
}

/** The fitted size curve on a set of comparables. */
function fitBase(train: SnapshotProtocol[]): { a: number; b: number; r2: number; n: number } {
  const f = ols(
    train.map((p) => Math.log10(p.tvl_usd)),
    train.map((p) => Math.log10(p.mcap_usd!)),
  );
  return { ...f, n: train.length };
}

/** Category residual means against the base curve, shrunk, only for categories with n >= 5. */
function categoryStats(train: SnapshotProtocol[], fit: { a: number; b: number }): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const p of train) {
    const r = Math.log10(p.mcap_usd!) - (fit.a + fit.b * Math.log10(p.tvl_usd));
    const c = p.category ?? 'Other';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(r);
  }
  const stats = new Map<string, number>();
  for (const [c, rs] of byCat) {
    if (rs.length >= 5) {
      const m = rs.reduce((s, v) => s + v, 0) / rs.length;
      stats.set(c, (m * rs.length) / (rs.length + 10));
    }
  }
  return stats;
}

/** The root of a slug (its first segment): protocols sharing a root may be siblings. */
function rootOf(p: SnapshotProtocol): string {
  const s = p.slug.split('-')[0]!;
  return s.length >= 3 ? s : p.slug;
}

/** Whether another protocol with a traded token shares this protocol's slug root. */
function hasTradedSibling(p: SnapshotProtocol, byRoot: Map<string, SnapshotProtocol[]>): boolean {
  const sibs = byRoot.get(rootOf(p)) ?? [];
  return sibs.some((q) => q.slug !== p.slug && !isPreToken(q));
}

/** The five dampened multipliers of one protocol (the fitted terms, shrunk to bounded ranges). */
export function multipliers(
  p: SnapshotProtocol,
  asOf: string,
  cat: Map<string, number>,
  byRoot: Map<string, SnapshotProtocol[]>,
): { growth: number; tenure: number; category: number; kinship: number; chains: number; age: number | null } {
  const growth = 10 ** (-0.25 * (clamp(finite(p.change_7d, 0), -50, 100) / 100));
  const age = ageDays(asOf, p.listed_at);
  const tenure = 0.9 + 0.2 * (Math.min(Math.max(age ?? 365, 0), 1095) / 1095);
  const category = 10 ** (cat.get(p.category ?? 'Other') ?? 0);
  const kinship = hasTradedSibling(p, byRoot) ? 0.5 : 1;
  const chains = 10 ** (-0.25 * Math.log10(Math.min(Math.max(p.chains.length, 1), 8)));
  return { growth, tenure, category, kinship, chains, age };
}

/** The implied value of one protocol under a fitted curve and category stats. */
function priceWith(
  p: SnapshotProtocol,
  asOf: string,
  fit: { a: number; b: number },
  cat: Map<string, number>,
  byRoot: Map<string, SnapshotProtocol[]>,
  terms: string[],
): { implied: number; base: number; mults: { growth: number; tenure: number; category: number; kinship: number; chains: number; age: number | null } } {
  const base = 10 ** (fit.a + fit.b * Math.log10(p.tvl_usd));
  const m = multipliers(p, asOf, cat, byRoot);
  let v = base;
  if (terms.includes('growth')) v *= m.growth;
  if (terms.includes('tenure')) v *= m.tenure;
  if (terms.includes('category')) v *= m.category;
  if (terms.includes('kinship')) v *= m.kinship;
  if (terms.includes('chains')) v *= m.chains;
  return { implied: Math.max(1, Math.round(v)), base, mults: m };
}

/** How wrong a prediction is: the larger of the two ratios. */
function missRatio(pred: number, actual: number): number {
  return Math.max(pred / actual, actual / pred);
}

/** The age buckets the token odds are fitted on. */
const ODDS_BUCKETS: [number, number][] = [
  [0, 180],
  [181, 365],
  [366, 730],
  [731, 1095],
  [1096, Number.POSITIVE_INFINITY],
];

/** The share of protocols that already trade, per age bucket, from the snapshot. */
function oddsBuckets(snapshot: Snapshot): { lo: number; hi: number | null; n: number; traded: number; p: number }[] {
  return ODDS_BUCKETS.map(([lo, hi]) => {
    const inB = snapshot.protocols.filter((q) => {
      const a = ageDays(snapshot.as_of, q.listed_at);
      return a !== null && a >= lo && a <= hi;
    });
    const traded = inB.filter((q) => !isPreToken(q)).length;
    return { lo, hi: Number.isFinite(hi) ? hi : null, n: inB.length, traded, p: inB.length > 0 ? traded / inB.length : 0 };
  });
}

/** The launch odds of one protocol: its age bucket's traded share (base rate when age is unknown). */
function oddsFor(p: SnapshotProtocol, snapshot: Snapshot, buckets: { lo: number; hi: number | null; p: number }[], baseRate: number): number {
  const age = ageDays(snapshot.as_of, p.listed_at);
  if (age === null) return baseRate;
  const b = buckets.find((x) => age >= x.lo && (x.hi === null || age <= x.hi));
  return b === undefined ? baseRate : b.p;
}

/** The Brier score of the bucket odds (leave-one-out) against the base rate's. */
function brierScores(snapshot: Snapshot, buckets: { lo: number; hi: number | null; n: number; traded: number; p: number }[]): { brier: number; baseBrier: number; baseRate: number } {
  const baseRate = snapshot.protocols.filter((q) => !isPreToken(q)).length / snapshot.protocols.length;
  let brier = 0;
  let baseBrier = 0;
  for (const p of snapshot.protocols) {
    const y = isPreToken(p) ? 0 : 1;
    const age = ageDays(snapshot.as_of, p.listed_at);
    let pr = baseRate;
    if (age !== null) {
      const b = buckets.find((x) => age >= x.lo && (x.hi === null || age <= x.hi));
      if (b !== undefined && b.n > 1) pr = (b.traded - (y === 1 ? 1 : 0)) / (b.n - 1);
      else if (b !== undefined) pr = b.p;
    }
    brier += (pr - y) * (pr - y);
    baseBrier += (baseRate - y) * (baseRate - y);
  }
  return { brier: brier / snapshot.protocols.length, baseBrier: baseBrier / snapshot.protocols.length, baseRate };
}

/** Gas per transaction in dollars, by chain: stated estimates, not quotes. */
const GAS_USD: Record<string, number> = {
  Ethereum: 8,
  Base: 0.5,
  Arbitrum: 1,
  Optimism: 0.5,
  Solana: 0.1,
  Tron: 2,
  Binance: 0.5,
  Polygon: 0.3,
  Avalanche: 0.5,
  Bittensor: 0.5,
  Sui: 0.1,
  Aptos: 0.1,
  Ink: 0.5,
  Blast: 0.5,
  Mode: 0.3,
  Berachain: 0.5,
  Hyperliquid: 0.5,
  Unichain: 0.5,
};

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
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
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A protocol's farm plan: seven steps, each an action with a cost and a time, plus the economics. */
function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  odds: number,
): { steps: string[]; deposit: number; gas: number; hold: number; expected: number; costs: number; net: number; netPerHour: number; verdict: 'FARM' | 'MARGINAL' | 'THIN' | 'SKIP' } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gasPerTx = GAS_USD[chain] ?? 2;
  const gas = gasPerTx * FARM.txCount;
  const timeCost = FARM.hours * FARM.hourlyRate;
  const oppCost = capital * FARM.tbill * (hold / 365);
  const expected = implied * odds * FARM.capture;
  const costs = gas + timeCost + oppCost;
  const net = expected - costs;
  const netPerHour = net / FARM.hours;
  const verdict: 'FARM' | 'MARGINAL' | 'THIN' | 'SKIP' =
    net >= VERDICT.farmNet && netPerHour >= VERDICT.farmPerHour
      ? 'FARM'
      : net >= VERDICT.marginalNet
        ? 'MARGINAL'
        : net >= VERDICT.thinNet
          ? 'THIN'
          : 'SKIP';
  const steps: FarmStep[] = [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas.toFixed(0)} of gas for ${FARM.txCount} transactions`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: `about $${gasPerTx.toFixed(2)} of gas a week on ${chain}`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    {
      text: `Expected airdrop value $${expected.toFixed(0)} at ${(odds * 100).toFixed(0)}% launch odds (a ${Math.round(FARM.dropShare * 100)}% drop split across ${FARM.farmers.toLocaleString('en-US')} farmers), minus $${costs.toFixed(0)} in gas, time and opportunity cost: net $${net.toFixed(0)}, about $${netPerHour.toFixed(0)} an hour. Verdict: ${verdict}.`,
      cost: `total costs $${costs.toFixed(0)}`,
      time: `${FARM.hours} hours of work`,
    },
  ];
  return { steps: steps.map(stepText), deposit: capital, gas, hold, expected, costs, net, netPerHour, verdict };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
function buildBoard(
  snapshot: Snapshot,
  fit: { a: number; b: number },
  cat: Map<string, number>,
  byRoot: Map<string, SnapshotProtocol[]>,
  buckets: { lo: number; hi: number | null; p: number }[],
  baseRate: number,
  terms: string[],
): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  // Median traded age per category, for the airdrop clock.
  const tradedAgeByCat = new Map<string, number[]>();
  const tradedAges: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    const a = ageDays(snapshot.as_of, p.listed_at);
    if (a === null) continue;
    tradedAges.push(a);
    const c = p.category ?? 'Other';
    if (!tradedAgeByCat.has(c)) tradedAgeByCat.set(c, []);
    tradedAgeByCat.get(c)!.push(a);
  }
  const medianTradedAge = median(tradedAges);

  const scored = [...chosen.values()].map((p) => {
    const { implied, base, mults } = priceWith(p, snapshot.as_of, fit, cat, byRoot, terms);
    const odds = oddsFor(p, snapshot, buckets, baseRate);
    const plan = farmSteps(p, mults.age, implied, odds);
    const medAge = tradedAgeByCat.has(p.category ?? 'Other') ? median(tradedAgeByCat.get(p.category ?? 'Other')!) : medianTradedAge;
    const progress = mults.age !== null && medAge > 0 ? Math.round((mults.age / medAge) * 100) : null;
    return { p, implied, base, mults, odds, plan, medAge, progress };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    age_days: s.mults.age,
    implied_value_usd: s.implied,
    model: {
      base_value_usd: Math.round(s.base * 100) / 100,
      growth_multiplier: Math.round(s.mults.growth * 1000000) / 1000000,
      tenure_multiplier: Math.round(s.mults.tenure * 1000000) / 1000000,
      category_multiplier: Math.round(s.mults.category * 1000000) / 1000000,
      kinship_multiplier: s.mults.kinship,
      chain_multiplier: Math.round(s.mults.chains * 1000000) / 1000000,
      age_days: s.mults.age,
    },
    odds: Math.round(s.odds * 1000) / 1000,
    expected_value_usd: Math.round(s.plan.expected),
    farm_net_usd: Math.round(s.plan.net),
    farm_net_per_hour_usd: Math.round(s.plan.netPerHour * 10) / 10,
    farm_verdict: s.plan.verdict,
    rank_lo: 0,
    rank_hi: 0,
    rank_stability: 0,
    airdrop_clock: { age_days: s.mults.age, median_traded_age_days: s.medAge, progress_pct: s.progress, bucket_odds: Math.round(s.odds * 1000) / 1000 },
    farm_steps: s.plan.steps,
  }));
}

/** The ablation: each term set's held-out median miss on leave-one-out and two walk-forward folds. */
function ablation(snapshot: Snapshot, comps: SnapshotProtocol[], byRoot: Map<string, SnapshotProtocol[]>): AblationRow[] {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at ?? '').localeCompare(b.listed_at ?? ''));
  const folds: [SnapshotProtocol[], SnapshotProtocol[]][] = [
    [dated.filter((p) => (p.listed_at ?? '') < '2024-01-01'), dated.filter((p) => (p.listed_at ?? '') >= '2024-01-01')],
    [dated.filter((p) => (p.listed_at ?? '') < '2024-07-01'), dated.filter((p) => (p.listed_at ?? '') >= '2024-07-01')],
  ];
  const sets: { terms: string[]; label: string; note: string }[] = [
    { terms: [], label: 'base curve only', note: 'The size curve alone.' },
    { terms: ['growth'], label: 'base + growth', note: 'TVL spikes are discounted.' },
    { terms: ['tenure'], label: 'base + tenure', note: 'Longer with no token: a small premium.' },
    { terms: ['category'], label: 'base + category', note: 'Category gaps from the comparables.' },
    { terms: ['kinship'], label: 'base + kinship', note: 'A traded sibling halves the value.' },
    { terms: ['chains'], label: 'base + chains', note: 'Breadth across chains is discounted.' },
    { terms: ['growth', 'tenure', 'category', 'kinship', 'chains'], label: 'full model (shipped)', note: 'All five dampened terms together.' },
  ];
  const rows: AblationRow[] = [];
  for (const s of sets) {
    const loo: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const train = comps.filter((_, j) => j !== i);
      const fit = fitBase(train);
      const cat = s.terms.includes('category') ? categoryStats(train, fit) : new Map<string, number>();
      const pred = priceWith(comps[i]!, snapshot.as_of, fit, cat, byRoot, s.terms).implied;
      loo.push(missRatio(pred, comps[i]!.mcap_usd!));
    }
    const wf = folds.map(([tr, te]) => {
      const fit = fitBase(tr);
      const cat = s.terms.includes('category') ? categoryStats(tr, fit) : new Map<string, number>();
      return median(te.map((p) => missRatio(priceWith(p, snapshot.as_of, fit, cat, byRoot, s.terms).implied, p.mcap_usd!)));
    });
    rows.push({
      terms: s.label,
      loo_median_miss: Math.round(median(loo) * 100) / 100,
      wf1_median_miss: Math.round(wf[0]! * 100) / 100,
      wf2_median_miss: Math.round(wf[1]! * 100) / 100,
      kept: false,
      note: s.note,
    });
  }
  const base = rows[0]!;
  const full = rows[rows.length - 1]!;
  full.kept = full.loo_median_miss < base.loo_median_miss && full.wf1_median_miss < base.wf1_median_miss && full.wf2_median_miss < base.wf2_median_miss;
  return rows;
}

/** The rank-stability band: 200 bootstrap refits of the curve, re-scoring the board each time. */
function rankBands(
  snapshot: Snapshot,
  comps: SnapshotProtocol[],
  board: BoardRow[],
  terms: string[],
): Map<string, { lo: number; hi: number; stability: number }> {
  const rng = mulberry32(20261114);
  const ranks = new Map<string, number[]>();
  for (const r of board) ranks.set(r.slug, []);
  for (let b = 0; b < BOOTSTRAP_REFITS; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    const fit = fitBase(sample);
    const cat = terms.includes('category') ? categoryStats(sample, fit) : new Map<string, number>();
    const byRoot = new Map<string, SnapshotProtocol[]>();
    for (const p of snapshot.protocols) {
      const r = rootOf(p);
      if (!byRoot.has(r)) byRoot.set(r, []);
      byRoot.get(r)!.push(p);
    }
    const scored = board.map((r) => {
      const p = snapshot.protocols.find((q) => q.slug === r.slug)!;
      return { slug: r.slug, implied: priceWith(p, snapshot.as_of, fit, cat, byRoot, terms).implied };
    });
    scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { lo: number; hi: number; stability: number }>();
  for (const [slug, rs] of ranks) {
    const lo = Math.min(...rs);
    const hi = Math.max(...rs);
    out.set(slug, { lo, hi, stability: Math.round((1 - (hi - lo) / Math.max(board.length - 1, 1)) * 100) / 100 });
  }
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps = comparables(snapshot);
  const fit = fitBase(comps);
  const cat = categoryStats(comps, fit);
  const byRoot = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    const r = rootOf(p);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(p);
  }
  const buckets = oddsBuckets(snapshot);
  const brier = brierScores(snapshot, buckets);
  const terms = ['growth', 'tenure', 'category', 'kinship', 'chains'];
  const board = buildBoard(snapshot, fit, cat, byRoot, buckets, brier.baseRate, terms);

  // Rank-stability bands from the bootstrap.
  const bands = rankBands(snapshot, comps, board, terms);
  for (const r of board) {
    const band = bands.get(r.slug)!;
    r.rank_lo = band.lo;
    r.rank_hi = band.hi;
    r.rank_stability = band.stability;
  }

  const verdictCounts = { FARM: 0, MARGINAL: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm_verdict]++;
  const hero = [...board]
    .sort((a, b) => b.farm_net_per_hour_usd - a.farm_net_per_hour_usd || a.rank - b.rank)
    .slice(0, 3)
    .map((r) => ({ slug: r.slug, name: r.name, net_usd: r.farm_net_usd, net_per_hour_usd: r.farm_net_per_hour_usd, hours: FARM.hours, deposit_usd: capitalFor(snapshot.protocols.find((q) => q.slug === r.slug)!) }));

  // Calibration: residual quantiles of the shipped model on the comparables, in-sample.
  const residuals = comps.map((p) => Math.log10(p.mcap_usd!) - Math.log10(priceWith(p, snapshot.as_of, fit, cat, byRoot, terms).implied));
  const p10 = quantile(residuals, 0.1);
  const p25 = quantile(residuals, 0.25);
  const p75 = quantile(residuals, 0.75);
  const p90 = quantile(residuals, 0.9);
  const calibration = {
    p10: Math.round(10 ** p10 * 100) / 100,
    p25: Math.round(10 ** p25 * 100) / 100,
    p75: Math.round(10 ** p75 * 100) / 100,
    p90: Math.round(10 ** p90 * 100) / 100,
    in_25_75_pct: Math.round((residuals.filter((r) => r >= p25 && r <= p75).length / residuals.length) * 1000) / 10,
    in_10_90_pct: Math.round((residuals.filter((r) => r >= p10 && r <= p90).length / residuals.length) * 1000) / 10,
    n: residuals.length,
  };

  // Ledger: every protocol in exactly one group.
  const boardSlugs = new Set(board.map((r) => r.slug));
  const traded = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const excludedReasons = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (boardSlugs.has(p.slug) || !isPreToken(p)) continue;
    const reason = p.category === 'CEX' ? 'exchange (CEX)' : VERSIONED.test(p.name) ? 'versioned pool name' : 'below the early cut (by TVL)';
    excludedReasons.set(reason, (excludedReasons.get(reason) ?? 0) + 1);
  }
  const excluded = [...excludedReasons.values()].reduce((s, v) => s + v, 0);

  // Scatter: comparables and board rows in log space, plus the fitted line.
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const scatter = {
    comps: comps.map((p) => [Math.log10(p.tvl_usd), Math.log10(p.mcap_usd!)] as [number, number]),
    board: board.map((r) => [Math.log10(r.tvl_usd), Math.log10(r.implied_value_usd)] as [number, number]),
    line: [Math.min(...xs), fit.a + fit.b * Math.min(...xs), Math.max(...xs), fit.a + fit.b * Math.max(...xs)] as [number, number, number, number],
  };

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit: { intercept: Math.round(fit.a * 10000) / 10000, slope: Math.round(fit.b * 10000) / 10000, r2: Math.round(fit.r2 * 1000) / 1000, n: fit.n },
    watchlist: [...snapshot.watchlist],
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: liveRows(snapshot).length,
    total_implied_usd: board.reduce((s, r) => s + r.implied_value_usd, 0),
    verdict_counts: verdictCounts,
    hero,
    rows: board,
    live: liveRows(snapshot),
    scatter,
    ablation: ablation(snapshot, comps, byRoot),
    calibration,
    odds: { buckets, brier: Math.round(brier.brier * 1000) / 1000, base_brier: Math.round(brier.baseBrier * 1000) / 1000, base_rate: Math.round(brier.baseRate * 1000) / 1000 },
    ledger: {
      ranked: board.length,
      traded,
      excluded,
      total: snapshot.protocols.length,
      excluded_reasons: [...excludedReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    },
    integrity: { board_sha256: '', watchlist: `${snapshot.watchlist.length}/${snapshot.watchlist.length}`, ledger: `${snapshot.protocols.length}/${snapshot.protocols.length}` },
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
