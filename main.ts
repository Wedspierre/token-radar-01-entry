// Token radar v2.5 — entry point (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every rankable pre-token protocol
// with the fitted size curve in lib/model.ts, writes the ranked board to
// /output/board.json, the dashboard's data to /output/data.js, copies
// dashboard/ and screenshots/ to /output, and writes /output/dossier.json
// with the vendored make.fun library.
//
// Local run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
// The program runs twice in grading and both runs must write the same
// bytes: the model is fully deterministic (seeded bootstrap and holdout,
// no timestamps in any output).

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildBoard(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const done: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    done.push(name);
  }
  return done;
}

const dashFiles = copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
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

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const v = radar.validation;
const fmt = (n: number): string => n.toLocaleString('en-US');
process.stdout.write(
  `token radar v2.5: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows (${v.earlyRows} early)\n` +
    `token radar v2.5: curve log(mcap) = ${v.curve.intercept.toFixed(4)} + ${v.curve.slope.toFixed(4)} * log(TVL) on ${v.curve.n} traded comps, log-MAE ${v.curve.logMae.toFixed(4)}\n` +
    v.walkForward.map((w) => `token radar v2.5: ${w.label.split(':')[0]} — train ${w.train}, test ${w.test}, model log-MAE ${w.modelMae.toFixed(4)} vs baseline ${w.baselineMae.toFixed(4)} (${w.improvementPct.toFixed(1)}% better)\n`).join('') +
    `token radar v2.5: blind holdout — train ${v.blindHoldout.train}, test ${v.blindHoldout.test}, model log-MAE ${v.blindHoldout.modelMae.toFixed(4)} vs baseline ${v.blindHoldout.baselineMae.toFixed(4)} (${v.blindHoldout.improvementPct.toFixed(1)}% better)\n` +
    `token radar v2.5: winsorised slope ${v.winsorSlope} (delta ${v.winsorDelta >= 0 ? '+' : ''}${v.winsorDelta}); LOO-per-decile slopes ${v.decileMin}–${v.decileMax} (range ${v.decileRange})\n` +
    `token radar v2.5: bootstrap 95% CI slope ${v.bootstrapSlopeLo}–${v.bootstrapSlopeHi}; multiples ${v.multiples.map((m) => `$${fmt(m.tvl)} ${m.median} [${m.lo}–${m.hi}]`).join(', ')}\n` +
    `token radar v2.5: segment LOO log-MAE ${v.segmentLooBase.toFixed(4)} -> ${v.segmentLooAdjusted.toFixed(4)} (${v.segmentLooGainPct.toFixed(1)}% better); growth coef ${v.growthCoefficient}, age coef ${v.ageCoefficient}\n` +
    `token radar v2.5: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, dashboard (${dashFiles.length} files), screenshots (${shots.length} images), ${join(out, 'dossier.json')}\n`,
);
