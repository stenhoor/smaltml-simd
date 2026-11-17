import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gramModule, SimdGram } from '../src/kernels/gram.ts';

/** A small, seeded generator, so every run sees the same numbers. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

/** (X − mean)ᵀ diag(w) (X − mean) over rows [from, to), with a column of ones: the plain triple loop. */
function plain(n: number, cols: number, d: Float64Array, mean: ArrayLike<number> | undefined, from: number, to: number, w: ArrayLike<number> | undefined, ones: boolean) {
  const p = cols + (ones ? 1 : 0);
  const at = (i: number, j: number) => (j === cols ? 1 : d[j * n + i]! - (mean ? mean[j]! : 0));
  const A = new Float64Array(p * p);
  for (let j = 0; j < p; j++) for (let k = 0; k <= j; k++) {
    let s = 0;
    for (let i = from; i < to; i++) s += (w ? w[i]! : 1) * at(i, j) * at(i, k);
    A[j * p + k] = s;
  }
  return A;
}

const kernels = [false, true].map((fused) => ({ fused, gram: new SimdGram(new WebAssembly.Module(gramModule(fused))) }));

test('both modules are valid WebAssembly', () => {
  for (const fused of [false, true]) assert.ok(WebAssembly.validate(gramModule(fused)));
});

for (const [n, cols] of [[1, 1], [2, 3], [7, 4], [513, 5], [1300, 11], [2049, 9], [600, 33]] as const) {
  test(`gramPart on ${n} × ${cols} equals the plain loops within rounding`, () => {
    const r = random(n * 31 + cols);
    const d = Float64Array.from({ length: n * cols }, () => r() * 10);
    const mean = Float64Array.from({ length: cols }, () => r() * 3);
    const w = Float64Array.from({ length: n }, () => r() + 1.5);
    const X = { rows: n, cols, data: d };
    const cases = [
      [undefined, 0, n, undefined, false],
      [mean, 0, n, undefined, false],
      [undefined, 0, n, w, true],
      [mean, Math.floor(n / 3), n - Math.floor(n / 5), w, false],
      [undefined, 0, n, undefined, true],
    ] as const;
    for (const { fused, gram } of kernels) {
      for (const [m, from, to, wt, ones] of cases) {
        const got = gram.gramPart(X, m, from, to, wt, ones);
        const want = plain(n, cols, d, m, from, to, wt, ones);
        const p = cols + (ones ? 1 : 0);
        assert.equal(got.length, p * p);
        for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) {
          const g = got[j * p + k]!;
          if (k > j) { assert.equal(g, 0, 'the upper triangle stays 0'); continue; }
          const scale = Math.sqrt(want[j * p + j]! * want[k * p + k]!) || 1;
          assert.ok(Math.abs(g - want[j * p + k]!) <= 1e-13 * scale, `${fused ? 'fused' : 'plain'}: [${j}, ${k}] ${g} vs ${want[j * p + k]}`);
        }
      }
    }
  });
}

test('an empty range of rows gives zeros, and the memory grows for wide matrices', () => {
  const { gram } = kernels[0]!;
  assert.deepEqual(Array.from(gram.gramPart({ rows: 3, cols: 2, data: new Float64Array(6) }, undefined, 2, 2)), [0, 0, 0, 0]);
  const n = 40;
  const cols = 300; // 300 × 512 × 8 bytes of buffer: more than the first page of memory
  const r = random(9);
  const d = Float64Array.from({ length: n * cols }, r);
  const got = gram.gramPart({ rows: n, cols, data: d }, undefined, 0, n);
  const want = plain(n, cols, d, undefined, 0, n, undefined, false);
  for (let j = 0; j < cols; j++) for (let k = 0; k <= j; k++) {
    assert.ok(Math.abs(got[j * cols + k]! - want[j * cols + k]!) <= 1e-13 * Math.sqrt(want[j * cols + j]! * want[k * cols + k]!));
  }
});

test('the same input gives the same result, bit for bit, call after call', () => {
  const r = random(3);
  const X = { rows: 1500, cols: 7, data: Float64Array.from({ length: 1500 * 7 }, r) };
  for (const { gram } of kernels) assert.deepEqual(gram.gramPart(X, undefined, 0, 1500), gram.gramPart(X, undefined, 0, 1500));
});
