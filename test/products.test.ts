// The logistic products kernel against plain loops: the scores X·w, a row step, and the sums Xᵀr, on odd sizes (rows
// that end mid-block and mid-vector, columns that aren't a multiple of 4), from row 0 and from an offset, binary and
// with 3 classes, with and without weights and an intercept, plain and with fused multiply-add.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productsModule, SimdProducts } from '../src/kernels/products.ts';
import { simdSupport } from 'smaltkit/simd';

/** A seeded stream in [0, 1). */
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A row step the test can follow: residual = weight · (score − label stand-in), loss = Σ weight · score². */
function rows(z: Float64Array, stride: number, K: number, y: Int32Array, w: ArrayLike<number> | undefined, at: number, m: number, loss: number): number {
  for (let i = 0; i < m; i++) {
    const wi = w ? w[at + i]! : 1;
    for (let c = 0; c < K; c++) {
      const zc = z[c * stride + i]!;
      loss += wi * zc * zc;
      z[c * stride + i] = wi * (zc - (y[at + i] === c ? 1 : 0));
    }
  }
  return loss;
}

/** The same, with plain loops over X: loss, and grad as K rows of (Xᵀr, then Σr). */
function plain(n: number, p: number, d: Float64Array, y: Int32Array, K: number, intercept: boolean, x: Float64Array, from: number, to: number, w: Float64Array | undefined) {
  const width = p + (intercept ? 1 : 0);
  const grad = new Float64Array(K * width);
  let loss = 0;
  for (let i = from; i < to; i++) {
    const z = new Float64Array(K);
    for (let c = 0; c < K; c++) {
      z[c] = intercept ? x[c * width + p]! : 0;
      for (let j = 0; j < p; j++) z[c]! += d[j * n + i]! * x[c * width + j]!;
    }
    loss = rows(z, 1, K, y, w, i, 1, loss);
    for (let c = 0; c < K; c++) {
      for (let j = 0; j < p; j++) grad[c * width + j]! += d[j * n + i]! * z[c]!;
      if (intercept) grad[c * width + p]! += z[c]!;
    }
  }
  return { loss, grad };
}

for (const fused of [false, true]) {
  test(`logistic products agree with plain loops${fused ? ', fused multiply-add' : ''}`, { skip: fused && !simdSupport().relaxed }, () => {
    const r = stream(fused ? 2 : 1);
    const kernel = new SimdProducts(new WebAssembly.Module(productsModule(fused)));
    for (const [n, p] of [[1, 1], [7, 3], [1029, 13], [1536, 8]] as const) {
      const d = Float64Array.from({ length: n * p }, () => (r() - 0.5) * 6);
      const before = d.slice();
      const prepared = kernel.prepare({ rows: n, cols: p, data: d })!;
      const y = Int32Array.from({ length: n }, () => Math.floor(r() * 3));
      const weights = Float64Array.from({ length: n }, () => r() * 2);
      for (const [from, to] of [[0, n], [Math.min(5, n - 1), n]] as const) {
        for (const w of [undefined, weights]) {
          for (const intercept of [false, true]) {
            for (const K of [1, 3]) {
              const width = p + (intercept ? 1 : 0);
              const x = Float64Array.from({ length: K * width }, () => r() - 0.5);
              const want = plain(n, p, d, y, K, intercept, x, from, to, w);
              const grad = new Float64Array(K * width).fill(9);
              const loss =
                K === 1
                  ? prepared.binaryPart(y, intercept, x, grad, from, to, w, (z, yy, ww, at, m, l) => rows(z, 512, 1, yy, ww, at, m, l))
                  : prepared.multinomialPart(y, K, intercept, x, grad, from, to, w, rows);
              const scale = (to - from) * 3 * 2 * 4;
              assert.ok(Math.abs(loss - want.loss) <= 1e-12 * Math.max(1, Math.abs(want.loss)), `loss ${loss} vs ${want.loss} (${n} × ${p}, K ${K})`);
              for (let i = 0; i < grad.length; i++) {
                assert.ok(Math.abs(grad[i]! - want.grad[i]!) <= 1e-13 * scale, `grad[${i}] ${grad[i]} vs ${want.grad[i]} (${n} × ${p}, K ${K}, from ${from})`);
              }
            }
          }
        }
      }
      assert.deepEqual(d, before, 'the kernel never writes X');
      prepared.release();
      assert.throws(() => prepared.binaryPart(y, false, new Float64Array(p), new Float64Array(p), 0, n, undefined, () => 0), /after release/);
    }
  });
}
