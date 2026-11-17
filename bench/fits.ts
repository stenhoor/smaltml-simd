// Times smaltml's fits with and without the plugin, on smaltml's benchmark data (the same seeded generator as smaltml's
// bench/data.mjs) and on a wider matrix: smaltml's own kernels, the plugin's plain SIMD, and its fused multiply-add,
// on one thread (fitSync) and on several (fit with threads). The median of several runs after a warm-up. Prints a
// Markdown table, and the largest relative difference of each fit's coefficients from smaltml's own.
//
// Then, with --matmul (or only that, with --only-matmul), smaltml's matMulSync, the matrix product on the CPU, with
// smaltml's kernel, plain SIMD and fused multiply-add.
//
// With --only-logistic, only the LogisticRegression fits by lbfgs (the logistic row kernels). The SIMD columns turn
// the logistic kernels on (useSimd({ logistic: true })); the other fits never call them.
//
//   node bench/fits.ts [--threads 4] [--matmul | --only-matmul | --only-logistic]
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { ElasticNet, Lasso, LinearRegression, LogisticRegression, Matrix, Ridge, configureThreads, matMulSync, stopThreads, useKernels, VERSION } from '@smaltworks/smaltml';
import { useSimd } from '../src/index.ts';

const at = process.argv.indexOf('--threads');
const threads = at > 0 ? Number(process.argv[at + 1]) : 4;

const SIZES = [
  { name: '10k × 20', n: 10_000, p: 20 },
  { name: '200k × 50', n: 200_000, p: 50 },
  { name: '50k × 200', n: 50_000, p: 200 },
];

/** smaltml's benchmark generator: mulberry32 and Box–Muller, the same numbers on every machine. */
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

function data(n: number, p: number) {
  const r = normals(n * 31 + p);
  const scale = Array.from({ length: p }, () => 0.5 + 20 * Math.abs(r()));
  const shift = Array.from({ length: p }, () => 10 * r());
  const w = Array.from({ length: p }, () => r());
  const X = new Float64Array(n * p);
  for (let j = 0; j < p; j++) for (let i = 0; i < n; i++) X[j * n + i] = r() * scale[j]! + shift[j]!;
  const y = new Float64Array(n);
  const y2 = new Float64Array(n);
  const y3 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let z = 0;
    for (let j = 0; j < p; j++) {
      const x = X[j * n + i]!;
      s += x * w[j]!;
      z += ((x - shift[j]!) / scale[j]!) * w[j]!;
    }
    y[i] = s + r();
    const zn = z + r();
    y2[i] = zn > 0 ? 1 : 0;
    y3[i] = zn < -0.6 ? 0 : zn < 0.6 ? 1 : 2;
  }
  return { X: new Matrix(n, p, X), y, y2, y3 };
}

async function median(f: () => unknown, reps: number): Promise<number> {
  await f();
  const ts: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    await f();
    ts.push(performance.now() - t);
  }
  return ts.sort((a, b) => a - b)[Math.floor(ts.length / 2)]!;
}

type Model = { fitSync(X: Matrix, y: Float64Array): { coef: Float64Array | Matrix }; fit(X: Matrix, y: Float64Array, o: object): Promise<unknown> };
const MODELS: [string, () => Model, 'y' | 'y2' | 'y3'][] = [
  ['LinearRegression', () => new LinearRegression(), 'y'],
  ['Ridge', () => new Ridge({ alpha: 1 }), 'y'],
  ['Lasso (alpha 0.1)', () => new Lasso({ alpha: 0.1 }), 'y'],
  ['ElasticNet (alpha 0.1)', () => new ElasticNet({ alpha: 0.1 }), 'y'],
  ['LogisticRegression, newton-cholesky', () => new LogisticRegression({ solver: 'newton-cholesky' }), 'y2'],
  ['LogisticRegression, lbfgs, 2 classes', () => new LogisticRegression(), 'y2'],
  ['LogisticRegression, lbfgs, 3 classes', () => new LogisticRegression(), 'y3'],
];
const onlyLogistic = process.argv.includes('--only-logistic');
const MODES = [
  ['smaltml', async () => { useKernels(null); }],
  ['SIMD', async () => { await useSimd({ logistic: true }); }],
  ['SIMD, fused', async () => { await useSimd({ fusedMultiplyAdd: true, logistic: true }); }],
] as const;

configureThreads({ max: threads });
const coef = (m: { coef: Float64Array | Matrix }) => (m.coef instanceof Matrix ? m.coef.data : m.coef);
const fmt = (ms: number) => (ms < 10 ? ms.toFixed(1) : ms.toFixed(0));
const onlyMatMul = process.argv.includes('--only-matmul');
console.log(`smaltml ${VERSION} with smaltml-simd, Node ${process.versions.node}, ${cpus()[0]?.model ?? 'unknown CPU'} (${cpus().length} cores); median ms`);
if (!onlyMatMul) {
  console.log();
  console.log(`| Data | Fit | smaltml, 1 thread | SIMD | SIMD, fused | smaltml, ${threads} threads | SIMD | SIMD, fused | Largest coefficient difference, SIMD (fused) |`);
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const { name, n, p } of SIZES) {
    const d = data(n, p);
    const reps = n * p < 2_000_000 ? 9 : onlyLogistic ? 3 : 5;
    for (const [model, make, target] of MODELS.filter(([name]) => !onlyLogistic || name.includes('lbfgs'))) {
      const one: number[] = [];
      const many: number[] = [];
      const coefs: Float64Array[] = [];
      for (const [, on] of MODES) {
        await on();
        one.push(await median(() => make().fitSync(d.X, d[target]), reps));
        many.push(await median(() => make().fit(d.X, d[target], { threads }), reps));
        coefs.push(coef(make().fitSync(d.X, d[target])));
      }
      const scale = Math.max(...Array.from(coefs[0]!, Math.abs));
      const diff = (c: Float64Array) => Math.max(...Array.from(c, (v, i) => Math.abs(v - coefs[0]![i]!))) / scale;
      const cell = (ts: number[], i: number) => (i === 0 ? fmt(ts[0]!) : `${fmt(ts[i]!)} (${(ts[0]! / ts[i]!).toFixed(1)}×)`);
      console.log(`| ${name} | ${model} | ${[0, 1, 2].map((i) => cell(one, i)).join(' | ')} | ${[0, 1, 2].map((i) => cell(many, i)).join(' | ')} | ${diff(coefs[1]!).toExponential(1)} (${diff(coefs[2]!).toExponential(1)}) |`);
    }
  }
}

if (onlyMatMul || process.argv.includes('--matmul')) {
  // matMulSync: A from the benchmark generator, B a few columns (predictions with several targets) or square.
  const PRODUCTS = [
    { name: '200k × 50 · 50 × 1', n: 200_000, p: 50, k: 1 },
    { name: '200k × 50 · 50 × 3', n: 200_000, p: 50, k: 3 },
    { name: '50k × 200 · 200 × 10', n: 50_000, p: 200, k: 10 },
    { name: '1,000 × 500 · 500 × 500', n: 1_000, p: 500, k: 500 },
  ];
  console.log();
  console.log('| Product | smaltml | SIMD | SIMD, fused | Equal to smaltml, SIMD | Largest difference, fused |');
  console.log('| --- | ---: | ---: | ---: | --- | ---: |');
  for (const { name, n, p, k } of PRODUCTS) {
    const r = normals(n + p + k);
    const A = new Matrix(n, p, Float64Array.from({ length: n * p }, r));
    const B = new Matrix(p, k, Float64Array.from({ length: p * k }, r));
    const reps = n * p * k < 50_000_000 ? 9 : 5;
    const times: number[] = [];
    const results: Float64Array[] = [];
    for (const [, on] of MODES) {
      await on();
      times.push(await median(() => matMulSync(A, B), reps));
      results.push(matMulSync(A, B).data);
    }
    let scale = 0;
    let fusedDiff = 0;
    for (let i = 0; i < results[0]!.length; i++) {
      scale = Math.max(scale, Math.abs(results[0]![i]!));
      fusedDiff = Math.max(fusedDiff, Math.abs(results[2]![i]! - results[0]![i]!));
    }
    const equal = results[1]!.every((v, i) => v === results[0]![i]);
    const fused = fusedDiff / scale;
    const cell = (i: number) => `${fmt(times[i]!)} (${(times[0]! / times[i]!).toFixed(1)}×)`;
    console.log(`| ${name} | ${fmt(times[0]!)} | ${cell(1)} | ${cell(2)} | ${equal ? 'yes, bit for bit' : 'no'} | ${fused.toExponential(1)} |`);
  }
}
useKernels(null);
await stopThreads();
