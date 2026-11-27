// Token Radar v2.6 — entry point (Node 22, standard library only).
//
// Reads the sealed snapshot, builds the radar with lib/model.ts, and writes
// /output/board.json, /output/data.js, /output/dashboard/, /output/screenshots/
// and /output/dossier.json (via the vendored make.fun library, byte for byte
// the scorer's own copy). Deterministic: seeded splits only, no clock, no
// network, so two runs write the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json). */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

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
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

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
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const v = radar.validation;
process.stdout.write(
  `token radar v2.6: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked (${radar.counts.traded} traded set aside, ${radar.counts.excluded_pretoken} pre-token excluded by rule)\n` +
    `token radar v2.6: curve log10(mcap) = ${radar.curve.intercept.toFixed(4)} + ${radar.curve.slope.toFixed(4)} x log10(TVL) on ${radar.curve.comps} comps, R2 ${radar.curve.r2.toFixed(4)}, in-sample log-MAE ${radar.curve.in_sample_mae.toFixed(4)}\n` +
    `token radar v2.6: ten-fold ${v.tenFold.model.toFixed(4)} vs flat ${v.tenFold.baseline.toFixed(4)} (${v.tenFold.betterPct.toFixed(1)}% better); walk-forward ${v.walkForward.map((w) => `${w.cut.slice(0, 4)} ${w.betterPct.toFixed(1)}%`).join(', ')}; blind holdout ${v.blindHoldout.betterPct.toFixed(1)}%; LOO ${v.loo.betterPct.toFixed(1)}%\n` +
    `token radar v2.6: segments ten-fold ${v.segmentTenFold.plain.toFixed(4)} -> ${v.segmentTenFold.segmented.toFixed(4)} (${v.segmentTenFold.betterPct.toFixed(1)}% better); bootstrap slope 95% CI ${v.bootstrap.slopeLow.toFixed(4)}–${v.bootstrap.slopeHigh.toFixed(4)}; blind size curve halves ${v.blindSizeCurve.halfA.toFixed(4)} / ${v.blindSizeCurve.halfB.toFixed(4)}\n` +
    `token radar v2.6: rank 1 ${board[0]!.slug} expected $${board[0]!.implied_value_usd.toLocaleString('en-US')} (implied $${board[0]!.implied_if_launches_usd.toLocaleString('en-US')} x ${(board[0]!.launch_odds * 100).toFixed(0)}% odds)\n` +
    `token radar v2.6: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
