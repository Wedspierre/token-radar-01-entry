// Token Radar v2.3 — the entrypoint (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// fits the size curve on the snapshot's own traded tokens, runs the out-of-sample triple
// lock (blind holdout, time-split, leave-one-out) plus a 1,000-resample bootstrap and 200
// refits for rank stability, scores every rankable pre-token protocol, writes the ranked
// board to /output/board.json, and copies this repository's dashboard/ and screenshots/
// to /output. Last, it writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes
// from the same board. The page recomputes a row's implied value from the snapshot figures
// and the fitted coefficients, so the page's code and the board's data are visibly the same
// arithmetic, and it renders the out-of-sample table, the bootstrap intervals and every
// farm plan's net line from that same data.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  bootstrapReport,
  buildBoard,
  buildRadar,
  dataScript,
  fitOn,
  flatBaselineTests,
  oosTests,
  parseSnapshot,
  rankStability,
  selectComps,
  selectTerms,
} from './lib/model.ts';
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

// The model, fitted at run time from this snapshot's own traded tokens.
const comps = selectComps(snapshot);
const { terms, table } = selectTerms(snapshot.as_of, comps);
// Refit the chosen terms on all comps: the curve the board is scored with.
const fit = fitOn(terms, snapshot.as_of, comps);

// The out-of-sample triple lock, on the same tests the term selection used.
const oos = {
  chosen: oosTests(terms, snapshot.as_of, comps),
  base: oosTests({ growth: false, age: false }, snapshot.as_of, comps),
  flat: flatBaselineTests(snapshot.as_of, comps),
};
const bootstrap = bootstrapReport(terms, snapshot.as_of, comps);
const board = buildBoard(snapshot, fit);
const stability = rankStability(snapshot, fit, board);
const { board: finalBoard, radar } = buildRadar(snapshot, fit, board, oos, table, bootstrap, stability);

const issue = boardIssue(finalBoard, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: finalBoard })}\n`);
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
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const fmt = (n: number): string => n.toFixed(4);
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${finalBoard.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: comps ${comps.length} one-per-ticker, terms ${radar.fit.terms}, intercept ${radar.fit.intercept}, slope ${radar.fit.slope}, age_coef ${radar.fit.age_coef ?? 'none'}, R2 ${radar.fit.r2}\n` +
    `token radar: OOS MAE log10 — blind ${fmt(oos.chosen.blind)} / time-split ${fmt(oos.chosen.timeSplit)} / LOO ${fmt(oos.chosen.loo)} (flat median ${fmt(oos.flat.blind)} / ${fmt(oos.flat.timeSplit)} / ${fmt(oos.flat.loo)})\n` +
    `token radar: bootstrap slope 95% CI [${bootstrap.slope.lo.toFixed(4)}, ${bootstrap.slope.hi.toFixed(4)}], multiple@50M [${bootstrap.multiple50m.lo.toFixed(3)}, ${bootstrap.multiple50m.hi.toFixed(3)}], median rank range ${radar.medianRankRange}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
