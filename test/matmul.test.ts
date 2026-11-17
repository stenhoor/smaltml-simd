import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matMulModule, SimdMatMul } from '../src/kernels/matmul.ts';

function random(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

/** A · B, column by column, in smaltml's order: for each output column, l from 0, the rows inside. */
function plain(n: number, p: number, k: number, a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(n * k);
  for (let j = 0; j < k; j++) for (let l = 0; l < p; l++) for (let i = 0; i < n; i++) out[j * n + i]! += a[l * n + i]! * b[j * p + l]!;
  return out;
}

const [plainSimd, fusedSimd] = [false, true].map((fused) => new SimdMatMul(new WebAssembly.Module(matMulModule(fused))));

test('both modules are valid WebAssembly', () => {
  for (const fused of [false, true]) assert.ok(WebAssembly.validate(matMulModule(fused)));
});

for (const [n, p, k] of [[1, 1, 1], [2, 3, 1], [5, 1, 4], [7, 4, 6], [13, 7, 3], [64, 20, 8], [513, 33, 5], [1000, 3, 17]] as const) {
  test(`matMul ${n} × ${p} · ${p} × ${k}: plain SIMD equals smaltml's order bit for bit, fused within rounding`, () => {
    const r = random(n * 7 + p * 3 + k);
    const a = Float64Array.from({ length: n * p }, () => r() * 10);
    const b = Float64Array.from({ length: p * k }, r);
    const want = plain(n, p, k, a, b);
    assert.deepEqual(plainSimd!.matMul(n, p, k, a, b), want);
    const got = fusedSimd!.matMul(n, p, k, a, b);
    assert.equal(got.length, n * k);
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) {
      let scale = 0;
      for (let l = 0; l < p; l++) scale += Math.abs(a[l * n + i]! * b[j * p + l]!);
      assert.ok(Math.abs(got[j * n + i]! - want[j * n + i]!) <= 1e-14 * scale, `[${i}, ${j}]`);
    }
  });
}

test('empty sizes give zeros, and the inputs are left as they were', () => {
  assert.deepEqual(Array.from(plainSimd!.matMul(4, 0, 2, new Float64Array(0), new Float64Array(0))), new Array(8).fill(0));
  assert.equal(plainSimd!.matMul(0, 3, 2, new Float64Array(0), new Float64Array(6)).length, 0);
  assert.equal(plainSimd!.matMul(3, 2, 0, new Float64Array(6), new Float64Array(0)).length, 0);
  const a = Float64Array.from({ length: 30 }, (_, i) => i);
  const b = Float64Array.from({ length: 12 }, (_, i) => 1 / (i + 1));
  const [a0, b0] = [a.slice(), b.slice()];
  plainSimd!.matMul(10, 3, 4, a, b);
  assert.deepEqual([a, b], [a0, b0]);
});

test('a bigger product after a smaller one grows the memory, and a smaller one after it still pads right', () => {
  const r = random(5);
  for (const [n, p, k] of [[3, 2, 1], [600, 120, 9], [5, 3, 2]] as const) {
    const a = Float64Array.from({ length: n * p }, r);
    const b = Float64Array.from({ length: p * k }, r);
    assert.deepEqual(plainSimd!.matMul(n, p, k, a, b), plain(n, p, k, a, b));
  }
});
