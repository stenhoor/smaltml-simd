// The logistic row kernels against smaltml's row steps, written here as smaltml's kernels compute them (smaltml's
// binaryLogisticPart and multinomialLogisticPart, the loop between X·w and Xᵀ·r).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logisticModule, SimdLogistic } from '../src/kernels/logistic.ts';

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const log1pExp = (z: number) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));

function binaryRows(z: Float64Array, y: Int32Array, w: Float64Array | undefined, at: number, m: number): number {
  let loss = 0;
  for (let i = 0; i < m; i++) {
    const zi = z[i]!;
    const yi = y[at + i]!;
    const wi = w ? w[at + i]! : 1;
    loss += wi * (log1pExp(zi) - yi * zi);
    z[i] = wi * (sigmoid(zi) - yi);
  }
  return loss;
}

function multinomialRows(z: Float64Array, stride: number, K: number, y: Int32Array, w: Float64Array | undefined, at: number, m: number): number {
  let loss = 0;
  for (let i = 0; i < m; i++) {
    let max = -Infinity;
    for (let c = 0; c < K; c++) max = Math.max(max, z[c * stride + i]!);
    const yi = y[at + i]!;
    const zy = z[yi * stride + i]!;
    let sum = 0;
    for (let c = 0; c < K; c++) {
      const e = Math.exp(z[c * stride + i]! - max);
      z[c * stride + i] = e;
      sum += e;
    }
    const wi = w ? w[at + i]! : 1;
    loss += wi * (max + Math.log(sum) - zy);
    for (let c = 0; c < K; c++) z[c * stride + i] = wi * (z[c * stride + i]! / sum - (c === yi ? 1 : 0));
  }
  return loss;
}

function random(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

const kernels = [false, true].map((fused) => ({ fused, k: new SimdLogistic(new WebAssembly.Module(logisticModule(fused))) }));

test('both modules are valid WebAssembly', () => {
  for (const fused of [false, true]) assert.ok(WebAssembly.validate(logisticModule(fused)));
});

for (const m of [1, 2, 7, 64, 511, 512]) {
  test(`${m} rows: losses within 10⁻¹⁴ and residuals within 10⁻¹⁵ of smaltml's, rows past m untouched`, () => {
    const r = random(m);
    const n = 1100;
    const at = 37;
    const y2 = Int32Array.from({ length: n }, () => (r() > 0 ? 1 : 0));
    const w = Float64Array.from({ length: n }, () => r() + 1.2);
    for (const K of [2, 3, 7]) {
      const yK = Int32Array.from({ length: n }, () => Math.min(K - 1, Math.floor(((r() + 1) / 2) * K)));
      for (const { fused, k } of kernels) {
        for (const weights of [undefined, w]) {
          // Scores from −40 to 40, so both of σ's branches, and exp far down, are exercised.
          const z = Float64Array.from({ length: m + 5 }, () => r() * 40);
          const [a, b] = [z.slice(), z.slice()];
          const want = binaryRows(a, y2, weights, at, m);
          const got = k.binaryRows(b, y2, weights, at, m);
          const where = `${fused ? 'fused' : 'plain'}${weights ? ', weighted' : ''}`;
          assert.ok(Math.abs(got - want) <= 1e-14 * Math.abs(want), `binary loss, ${where}: ${got} vs ${want}`);
          for (let i = 0; i < m + 5; i++) {
            if (i >= m) assert.equal(b[i], z[i]);
            else assert.ok(Math.abs(b[i]! - a[i]!) <= 1e-15 * (weights ? 2.2 : 1), `binary residual ${i}, ${where}`);
          }
          const stride = m + 9;
          const zK = Float64Array.from({ length: K * stride }, () => r() * 40);
          const [c1, c2] = [zK.slice(), zK.slice()];
          const wantK = multinomialRows(c1, stride, K, yK, weights, at, m);
          const gotK = k.multinomialRows(c2, stride, K, yK, weights, at, m);
          assert.ok(Math.abs(gotK - wantK) <= 1e-14 * Math.abs(wantK), `${K}-class loss, ${where}: ${gotK} vs ${wantK}`);
          for (let c = 0; c < K; c++) {
            for (let i = 0; i < stride; i++) {
              const j = c * stride + i;
              if (i >= m) assert.equal(c2[j], zK[j]);
              else assert.ok(Math.abs(c2[j]! - c1[j]!) <= 1e-15 * (weights ? 2.2 : 1), `${K}-class residual ${c}, ${i}, ${where}`);
            }
          }
        }
      }
    }
  });
}

test('no rows gives no loss', () => {
  const { k } = kernels[0]!;
  assert.equal(k.binaryRows(new Float64Array(4), new Int32Array(4), undefined, 0, 0), 0);
  assert.equal(k.multinomialRows(new Float64Array(8), 4, 2, new Int32Array(4), undefined, 0, 0), 0);
});
