// Token Radar: the entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and screenshots/ to /output.
// Last, it writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. The integrity strip on the page shows the board's sha256, so the page
// can be checked against the file it was built from.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes
// from the same board.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });

// The board first: its sha256 is what the page's integrity strip shows.
const boardText = `${JSON.stringify({ rows: board })}\n`;
const boardSha = createHash('sha256').update(boardText, 'utf8').digest('hex');
radar.integrity.board_sha256 = boardSha;
writeFileSync(join(out, 'board.json'), boardText);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  // A screenshot that is nearly empty is usually a blank page: refuse it, not the run.
  const shotBytes = statSync(join(out, 'screenshots', name)).size;
  if (shotBytes < 20_000) {
    process.stderr.write(`token radar: screenshots/${name} is only ${shotBytes} bytes: the page probably did not render\n`);
    process.exit(1);
  }
  if (shotBytes < 100_000) process.stderr.write(`token radar: warning: screenshots/${name} is ${shotBytes} bytes, smaller than expected for a full page\n`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// Re-check the integrity strip: the sha the page shows must be the board's sha on disk.
const boardAgain = readFileSync(join(out, 'board.json'), 'utf8');
const shaAgain = createHash('sha256').update(boardAgain, 'utf8').digest('hex');
if (shaAgain !== boardSha) {
  process.stderr.write(`token radar: the board's sha changed after writing: ${shaAgain} is not ${boardSha}\n`);
  process.exit(1);
}
// The dossier's text cap is the dashboard's source budget: report what it costs.
const dashBytes = ['index.html', 'app.css', 'app.js'].reduce((n, f) => n + statSync(join(here, 'dashboard', f)).size, 0);
if (dashBytes > TEXT_MAX_BYTES) {
  process.stderr.write(`token radar: dashboard source is ${dashBytes} bytes, over the ${TEXT_MAX_BYTES} the dossier's text holds\n`);
  process.exit(1);
}

const full = radar.ablation[radar.ablation.length - 1]!;
const base = radar.ablation[0]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: fit log10(mcap) = ${radar.fit.intercept} + ${radar.fit.slope}*log10(TVL), R2 ${radar.fit.r2}, n=${radar.fit.n}\n` +
    `token radar: ablation base LOO x${base.loo_median_miss} WF1 x${base.wf1_median_miss} WF2 x${base.wf2_median_miss} | full LOO x${full.loo_median_miss} WF1 x${full.wf1_median_miss} WF2 x${full.wf2_median_miss}\n` +
    `token radar: odds Brier ${radar.odds.brier} vs base ${radar.odds.base_brier} (base rate ${radar.odds.base_rate})\n` +
    `token radar: total implied $${radar.total_implied_usd.toLocaleString('en-US')}, verdicts FARM ${radar.verdict_counts.FARM} MARGINAL ${radar.verdict_counts.MARGINAL} THIN ${radar.verdict_counts.THIN} SKIP ${radar.verdict_counts.SKIP}\n` +
    `token radar: board sha256 ${boardSha}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
