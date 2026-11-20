# Token Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ibr6ixhim/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ibr6ixhim/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Farm the next token first: a radar that ranks the 198 pre-token protocols with the most to gain,
from the 2026-11-14 DefiLlama snapshot, and tells you exactly what each farm costs and pays.

The answer comes first. The board opens with **Farm dulu ini** — the three farms with the best
net dollars per hour of work — and every row carries its own farm plan, its launch odds, its
airdrop clock, and its rank-stability band from 200 bootstrap refits of the size curve.

## The model, in one line

```
implied = 10^(3.0549 + 0.5162 · log10 TVL) × growth × tenure × category × kinship × chains
```

The curve is fitted by ordinary least squares on the **127 traded tokens** in the snapshot
itself (R² 0.197). Each of the five terms is a dampened, bounded adjustment — the raw fitted
coefficients are unstable across time folds, so they are shrunk to ranges that cannot distort
the ranking. The dashboard prints the full ablation table: the shipped model beats the base
curve on all three held-out tests (leave-one-out ×3.24 vs ×3.36; walk-forward ×2.82 vs ×2.91
and ×2.89 vs ×3.16). The token odds come from a separate age-bucket fit (Brier 0.22 vs the
base rate's 0.248), and the range bands are audited: 51.2% of tokens fall inside the stated
50% band, 81.1% inside the stated 80% band.

## Farm economics

Expected airdrop value = implied value × launch odds × 0.00001 (a 5% airdrop split across
5,000 active farmers — a stated assumption, adjustable on the page with the what-if slider).
Costs are per-chain gas estimates, 1.5 hours of work at $15/hour, and the T-bill 4%
opportunity cost of the deposit over the hold. The verdict follows from the net: **19 FARM,
43 MARGINAL, 56 THIN, 80 SKIP** out of 198 rows. Total implied value: $1.62B.

## The board

- **198 rows**: the 40-protocol watchlist (every protocol with at least $50M TVL and no token)
  plus the 158 pre-token protocols below the floor with the most TVL.
- **Ledger**: all 758 protocols in exactly one group — 198 ranked, 416 with a token already
  trading (set aside), 144 pre-token and not ranked (91 below the early cut, 42 exchanges,
  11 versioned pool names).
- **Detail view** per protocol: the 7-step farm plan with cost and time, the model breakdown
  (base × each multiplier), the airdrop clock, and its position on the size curve.
- **Filtered view**: tier (Watchlist / Early / Off-list), category, chain, search, minimum TVL,
  and sorting by rank, implied value, or net per hour.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only, no network, no install. The program writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output
directory, and refuses to write a board the gate will not take. Run it twice: every byte
is identical.

## Layout

- `main.ts` — the entrypoint: read the snapshot, score the board, write the outputs.
- `lib/model.ts` — the model: the size curve, the odds, the farm economics, the ledger.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged from the kit.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js` (34 KB of source).
- `screenshots/` — the three views the dossier covers: board, detail, filtered.
