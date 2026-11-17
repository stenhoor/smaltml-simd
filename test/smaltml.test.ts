// The plugin with smaltml: useSimd() replaces gramPart, fits agree with smaltml's own within rounding, and fits on
// several threads equal fitSync, bit for bit (smaltml ADR 0035, items 7 and 8).
import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { kernelsInUse, LinearRegression, LogisticRegression, Matrix, matMulSync, Ridge, stopThreads, useKernels } from '@smaltworks/smaltml';
import { threadPool } from '@smaltworks/smaltml/parallel';
import { useSimd } from '../src/index.ts';

afterEach(() => {
  useKernels(null);
});
after(() => stopThreads());

function random(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

/** 40,000 × 12: over smaltml's parallel threshold, in three chunks of rows. */
const n = 40_000;
const p = 12;
const r = random(17);
const X = new Matrix(n, p, Float64Array.from({ length: n * p }, (_, k) => r() * (1 + (k % 5))));
const w = Float64Array.from({ length: p }, () => r());
const y = Float64Array.from({ length: n }, (_, i) => { let s = 0.3; for (let j = 0; j < p; j++) s += X.data[j * n + i]! * w[j]!; return s + 0.1 * r(); });
const labels = Float64Array.from(y, (v) => (v + 0.2 * r() > 0 ? 1 : 0));

const near = (a: ArrayLike<number>, b: ArrayLike<number>, rel: number) => {
  const scale = Math.max(...Array.from(b, Math.abs));
  for (let i = 0; i < b.length; i++) assert.ok(Math.abs(a[i]! - b[i]!) <= rel * scale, `${a[i]} vs ${b[i]}`);
};

test('useSimd() replaces gramPart, and useKernels(null) puts smaltml\'s back', async () => {
  assert.equal(await useSimd(), true);
  assert.deepEqual(kernelsInUse(), { name: 'smaltml-simd', kernels: ['gramPart', 'matMul'], rejected: [] });
  useKernels(null);
  assert.equal(kernelsInUse().name, 'smaltml');
  assert.equal(await useSimd({ fusedMultiplyAdd: true }), true);
  assert.equal(kernelsInUse().name, 'smaltml-simd, fused multiply-add');
});

test('fits with the plugin agree with smaltml\'s own within rounding, and move in the last bits', async () => {
  const coef = (m: { coef: Float64Array | Matrix }) => (m.coef instanceof Matrix ? m.coef.data : m.coef);
  const fits: (() => { coef: Float64Array | Matrix })[] = [
    () => new LinearRegression().fitSync(X, y),
    () => new Ridge({ alpha: 2 }).fitSync(X, y),
    () => new LogisticRegression({ solver: 'newton-cholesky' }).fitSync(X, labels),
  ];
  for (const fit of fits) {
    const own = fit();
    for (const fusedMultiplyAdd of [false, true]) {
      await useSimd({ fusedMultiplyAdd });
      const simd = fit();
      near(coef(simd), coef(own), 1e-12);
      useKernels(null);
    }
  }
});

test('fits on several threads with the plugin equal fitSync, bit for bit', async () => {
  for (const fusedMultiplyAdd of [false, true]) {
    await useSimd({ fusedMultiplyAdd });
    // The pool starts only if every worker loaded the plugin's kernels; otherwise fits would quietly run on one thread.
    assert.notEqual(await threadPool(4, Infinity), null, 'the workers load the plugin');
    const one = new Ridge({ alpha: 2 }).fitSync(X, y).toJSON();
    for (const threads of [2, 4]) {
      assert.deepEqual((await new Ridge({ alpha: 2 }).fit(X, y, { threads })).toJSON(), one, `${threads} threads`);
    }
    const lone = new LogisticRegression({ solver: 'newton-cholesky' }).fitSync(X, labels).toJSON();
    assert.deepEqual((await new LogisticRegression({ solver: 'newton-cholesky' }).fit(X, labels, { threads: 3 })).toJSON(), lone);
    useKernels(null);
  }
});

test('matMulSync with the plugin gives smaltml\'s result bit for bit, and fused within rounding', async () => {
  const A = new Matrix(1001, 7, Float64Array.from({ length: 1001 * 7 }, () => r() * 5));
  const B = new Matrix(7, 3, Float64Array.from({ length: 21 }, r));
  const own = matMulSync(A, B).data;
  await useSimd();
  assert.deepEqual(matMulSync(A, B).data, own);
  await useSimd({ fusedMultiplyAdd: true });
  near(matMulSync(A, B).data, own, 1e-14);
});

test('lbfgs logistic fits with the plugin\'s row kernels agree with smaltml\'s own within rounding, and threads equal fitSync', async () => {
  const labels3 = Float64Array.from(y, (v) => (v < -0.5 ? 0 : v < 0.5 ? 1 : 2));
  for (const target of [labels, labels3]) {
    const own = new LogisticRegression({ maxIter: 30 }).fitSync(X, target);
    for (const fusedMultiplyAdd of [false, true]) {
      await useSimd({ fusedMultiplyAdd, logistic: true });
      const simd = new LogisticRegression({ maxIter: 30 }).fitSync(X, target);
      near((simd.coef as Matrix).data, (own.coef as Matrix).data, 1e-9);
      assert.deepEqual((await new LogisticRegression({ maxIter: 30 }).fit(X, target, { threads: 3 })).toJSON(), simd.toJSON());
      useKernels(null);
    }
  }
});

test('the logistic kernels are off unless asked for', async () => {
  await useSimd();
  assert.deepEqual(kernelsInUse().kernels, ['gramPart', 'matMul']);
  await useSimd({ logistic: true });
  assert.deepEqual(kernelsInUse().kernels, ['gramPart', 'matMul', 'binaryLogisticRows', 'multinomialLogisticRows']);
});
