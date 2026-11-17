---
description: 'smaltml SIMD in five minutes: install it, turn it on, and fit a model with it, in your browser.'
---

# Quick start

Three steps: install the plugin beside smaltml, turn it on, and fit as before.

## 1. Install

```sh
npm install @smaltworks/smaltml @smaltworks/smaltml-simd # not on npm yet
```

smaltml SIMD needs smaltml itself, which it plugs into, and nothing else.

## 2. Turn it on

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { kernelsInUse } from '@smaltworks/smaltml';

await useSimd();
kernelsInUse()
```

| name | kernels | rejected |
| --- | --- | --- |
| smaltml-simd | [gramPart, matMul] | [] |

`useSimd()` resolves to `true` where the engine has WebAssembly SIMD, and to `false` where it doesn't. smaltml's own
kernels then stay in use. smaltml checks the plugin's kernel against its own before it uses it. `gramPart` is smaltml's
name for XᵀX, and `matMul` for the matrix product.

## 3. Fit as before

Nothing else changes: the same models, options and results, to all but the last bits. Here Ridge is fitted with the
plugin and without, on 20,000 rows of 40 columns.

```ts
import { Matrix, Ridge, useKernels } from '@smaltworks/smaltml';

// 20,000 × 40, from a small seeded generator.
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
const n = 20_000, p = 40;
const X = new Matrix(n, p, Float64Array.from({ length: n * p }, random));
const y = Array.from({ length: n }, (_, i) => X.data[i] - 2 * X.data[n + i] + random() / 10);

const t0 = performance.now();
const simdModel = new Ridge().fitSync(X, y);
const t1 = performance.now();
useKernels(null); // smaltml's own kernels again
const ownModel = new Ridge().fitSync(X, y);
const t2 = performance.now();
await useSimd();

const difference = Math.max(...simdModel.coef.map((c, j) => Math.abs(c - ownModel.coef[j])));
({ sameModelToRounding: difference < 1e-12, firstCoefficient: simdModel.coef[0] })
```

| sameModelToRounding | firstCoefficient |
| --- | --- |
| true | 0.999585 |



Press **Run** to fit it in your browser. Press **Edit** and end with `({ simd: t1 - t0, smaltml: t2 - t1 })` to see
the two fits' times, in milliseconds, on your machine. They aren't part of the tested result, since they differ
from one run to the next.

## Next

- [Using the plugin](./): what it changes, fused multiply-add, and where it runs.
- [Threads and bundlers](./threads): fits on several cores, and apps that bundle.
- [Benchmarks](./benchmarks): the measured speed of every fit.
