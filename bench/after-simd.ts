// Whether a SIMD fit slows the JavaScript that runs after it in the same process: a Ridge fit (the plugin's
// gramPart), then a LogisticRegression lbfgs fit and a DecisionTreeRegressor (smaltml's own code), at 200k × 50 on one
// thread. Each run is its own process, with one of two builds of the plugin's kernel module or none, in turn, for
// several rounds, so the builds see the same machine. Prints the range of each fit's times per build.
//
// Written for the memory fix (bench/README.md, 2026-11-18): build the plugin before and after a change, compile
// this script (npx tsc -p tsconfig.bench.json; run as .ts it measures the slowdown TypeScript loading causes), then
//   node .bench/bench/after-simd.js --smaltml ../smaltml/dist/smaltml.js --a OLD/dist/smaltml-simd-kernels.js \
//     --b dist/smaltml-simd-kernels.js [--rounds 3] [--data ../smaltml/bench/data]
// --smaltml is a built smaltml (dist/smaltml.js); its decision tree needs smaltml's phase 2 (main after #48).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name: string, fallback?: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  const v = at > 0 ? process.argv[at + 1] : fallback;
  if (v === undefined) throw new Error(`--${name} is required`);
  return v;
};
const url = (path: string) => pathToFileURL(resolve(path)).href;

interface Fit { fitSync(X: unknown, y: Float64Array): unknown }
interface Smaltml {
  Matrix: new (rows: number, cols: number, data: Float64Array) => unknown;
  Ridge: new (o: object) => Fit;
  LogisticRegression: new () => Fit;
  DecisionTreeRegressor: new (o: object) => Fit;
  useKernels(set: unknown): unknown;
}

/** smaltml's benchmark generator (as bench/fits.ts): mulberry32 and Box–Muller. */
function normals(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-300)) * Math.cos(2 * Math.PI * u());
}

/**
 * The data: with --data, smaltml's benchmark data, 200k × 50 (smaltml's bench/data.mjs writes it to its bench/data/);
 * otherwise generated here.
 */
function data(): { n: number; p: number; X: Float64Array; y: Float64Array; y2: Float64Array } {
  const dir = process.argv.indexOf('--data') > 0 ? arg('data') : null;
  if (dir) {
    const meta = (JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8')) as { n: number; p: number; key: string }[]).find((s) => s.n === 200_000)!;
    const f64 = (file: string) => {
      const b = readFileSync(`${dir}/${file}`);
      return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8).slice();
    };
    return { n: meta.n, p: meta.p, X: f64(`${meta.key}.X`), y: f64(`${meta.key}.y`), y2: f64(`${meta.key}.y2`) };
  }
  const n = 200_000;
  const p = 50;
  const r = normals(n * 31 + p);
  const X = new Float64Array(n * p);
  for (let i = 0; i < X.length; i++) X[i] = r() * 5 + 1;
  const y = new Float64Array(n);
  const y2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += X[j * n + i]! * ((j % 7) - 3) * 0.01;
    y[i] = s + r();
    y2[i] = s + r() > 0 ? 1 : 0;
  }
  return { n, p, X, y, y2 };
}

/** One run: prints {ridge, lbfgs, tree} in ms, each the second of two fits. */
async function run(smaltmlPath: string, kernels: string): Promise<void> {
  const ml = (await import(url(smaltmlPath))) as Smaltml;
  ml.useKernels(null);
  if (kernels !== 'none') {
    const kernelSet = (await import(url(kernels))) as { default: (o: object) => Promise<unknown> };
    ml.useKernels(await kernelSet.default({}));
  }
  const { n, p, X, y, y2 } = data();
  const M = new ml.Matrix(n, p, X);
  const fits: [string, () => unknown][] = [
    ['ridge', () => new ml.Ridge({ alpha: 1 }).fitSync(M, y)],
    ['lbfgs', () => new ml.LogisticRegression().fitSync(M, y2)],
    ['tree', () => new ml.DecisionTreeRegressor({ maxDepth: 10, seed: 0 }).fitSync(M, y)],
  ];
  const out: Record<string, number> = {};
  for (const [name, f] of fits) {
    f();
    const t = performance.now();
    f();
    out[name] = Math.round(performance.now() - t);
  }
  console.log(JSON.stringify(out));
}

if (process.argv.includes('--run')) {
  await run(arg('smaltml'), arg('kernels'));
} else {
  const smaltml = arg('smaltml');
  const builds: [string, string][] = [['A', arg('a')], ['B', arg('b')], ['none', 'none']];
  const rounds = Number(arg('rounds', '3'));
  const times: Record<string, Record<string, number[]>> = {};
  for (let round = 0; round < rounds; round++) {
    for (const [name, kernels] of builds) {
      const line = execFileSync(process.execPath, [import.meta.filename, '--run', '--smaltml', smaltml, '--kernels', kernels, ...(process.argv.indexOf('--data') > 0 ? ['--data', arg('data')] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const t = JSON.parse(line.trim().split('\n').at(-1)!) as Record<string, number>;
      for (const [fit, ms] of Object.entries(t)) ((times[name] ??= {})[fit] ??= []).push(ms);
    }
  }
  const range = (v: number[]) => `${Math.min(...v).toLocaleString('en')}–${Math.max(...v).toLocaleString('en')}`;
  console.log(`${rounds} rounds, 200k × 50, one thread; ms per fit, the lowest and highest`);
  console.log('| Plugin | Ridge (SIMD) | lbfgs, 2 classes (smaltml\'s kernels) | DecisionTreeRegressor, depth 10 |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const [name] of builds) {
    const t = times[name]!;
    console.log(`| ${name} | ${range(t.ridge!)} | ${range(t.lbfgs!)} | ${range(t.tree!)} |`);
  }
}
