// The workers' module, bundled by scripts/bundle.mjs (npm ci and npm run build write it): one file with no imports,
// whose kernel set computes what the source's does, and which smaltml's thread pool workers can load.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Matrix, Ridge, stopThreads, useKernels } from '@smaltworks/smaltml';
import { threadPool } from '@smaltworks/smaltml/parallel';
import source from '../src/kernels.ts';
import { useSimd } from '../src/index.ts';

const file = new URL('../dist/smaltml-simd-kernels.js', import.meta.url);
after(async () => {
  useKernels(null);
  await stopThreads();
});

test('the bundle exists and imports nothing', () => {
  assert.ok(existsSync(file), 'dist/smaltml-simd-kernels.js: run npm run build');
  assert.doesNotMatch(readFileSync(file, 'utf8'), /^\s*import\b/m);
});

test('its kernel set computes what the source\'s does, bit for bit', async () => {
  const bundled = (await import(file.href)) as { default: typeof source };
  const X = { rows: 777, cols: 9, data: Float64Array.from({ length: 777 * 9 }, (_, i) => Math.sin(i) * 7) };
  for (const fusedMultiplyAdd of [false, true]) {
    const [a, b] = [await bundled.default({ fusedMultiplyAdd }), await source({ fusedMultiplyAdd })];
    assert.equal(a.name, b.name);
    assert.deepEqual(a.kernels.gramPart!(X as never, undefined, 0, 777), b.kernels.gramPart!(X as never, undefined, 0, 777));
  }
});

test('smaltml\'s workers load the bundle given as kernelsModule, and threaded fits equal fitSync', async () => {
  const n = 40_000;
  const p = 6;
  const X = new Matrix(n, p, Float64Array.from({ length: n * p }, (_, i) => Math.cos(i * 0.37) * (1 + (i % 3))));
  const y = Float64Array.from({ length: n }, (_, i) => X.data[i]! - 2 * X.data[n + i]! + Math.sin(i));
  assert.equal(await useSimd({ kernelsModule: pathToFileURL(file.pathname).href }), true);
  assert.notEqual(await threadPool(3, Infinity), null, 'the workers load the bundle');
  const one = new Ridge().fitSync(X, y).toJSON();
  assert.deepEqual((await new Ridge().fit(X, y, { threads: 3 })).toJSON(), one);
});
