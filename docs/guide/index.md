---
description: 'Using smaltml SIMD: turning it on and off, what it changes and what it does not, fused multiply-add, and where it runs.'
---

# Using the plugin

smaltml is TypeScript, and JavaScript has no SIMD: its engines run a loop over a `Float64Array` one number at a time.
WebAssembly has had 128-bit SIMD in every major browser since 2021–2023. smaltml SIMD runs smaltml's heaviest CPU
kernels there:

- `gramPart`, XᵀX: the Gram matrix behind LinearRegression, Ridge, Lasso, ElasticNet and LogisticRegression's
  `newton-cholesky` solver;
- `matMul`, A · B: the matrix product behind `matMulSync`, and `matMul` when it runs on the CPU;
- with `useSimd({ logistic: true })`, `binaryLogisticRows` and `multinomialLogisticRows`: the logistic objective's
  step for each block of rows (its loss, and the residuals its gradient needs), behind LogisticRegression's default
  solver, `lbfgs`. They spend their time in exp, log1p and log, which WebAssembly has no SIMD instructions for, so the
  plugin brings its own. They are off by default: on the [benchmark](./benchmarks) they gained little.

## Turning it on and off

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { kernelsInUse, useKernels } from '@smaltworks/smaltml';

const on = await useSimd();
const using = kernelsInUse().name;
useKernels(null); // smaltml's own kernels again
({ on, using, after: kernelsInUse().name })
```

| on | using | after |
| --- | --- | --- |
| true | smaltml-simd | smaltml |

The plugin works through smaltml's [`useKernels`](https://stenhoor.github.io/smaltml/reference/use-kernels), which
any plugin can use. Nothing in smaltml looks for a plugin: an app that doesn't call `useSimd()` runs exactly as without
it. Turning it on applies to every fit after it, in this thread and in smaltml's thread pool.

## What changes, and what doesn't

- **Speed:** the fits built on XᵀX, and the matrix product; with `logistic: true`, a little on `lbfgs` fits. A fit's gain grows with the number of columns, since
  XᵀX's work grows with their square while the rest of a fit reads each value once. See [Benchmarks](./benchmarks).
- **The last bits:** the XᵀX kernel sums in another order: the even rows and the odd rows apart, then together.
  Fits are close to smaltml's own, not equal, and move by about 10⁻¹⁵ relative on well-conditioned data. Every compare case
  of smaltml against scikit-learn still passes with the plugin on; the plugin's CI runs them.
- **Not the models, the API or saved models.** A model fitted with the plugin saves and loads as any other.
- **Not the matrix product's result:** under plain SIMD, `matMulSync` gives smaltml's own result bit for bit, since
  each sum adds its products in the same order. Fused multiply-add moves it within rounding.
- **Not the agreement between calls:** an asynchronous fit gives exactly its `fitSync` twin's result, and a fit on
  several threads gives exactly what one thread gives ([Threads and bundlers](./threads)).

```ts
import { Matrix, LinearRegression } from '@smaltworks/smaltml';

await useSimd();
const X = Matrix.fromRows([[1, 2], [2, 1], [3, 5], [4, 3], [5, 8], [6, 4]]);
const model = new LinearRegression().fitSync(X, [5, 4, 13, 10, 21, 14]);
({ coef: model.coef, intercept: model.intercept })
```

| coef | intercept |
| --- | --- |
| [1, 2] | 0 |

## Fused multiply-add

`useSimd({ fusedMultiplyAdd: true })` uses relaxed SIMD's `f64x2.relaxed_madd` where the engine has it (Chrome 114
and later, and Node). It is faster still on most fits, and rounds once per multiply-add where the processor fuses
it. Because a processor may fuse it or not, the last bits can differ between machines. Plain SIMD gives one result
everywhere, so fused multiply-add is off by default.

```ts
await useSimd({ fusedMultiplyAdd: true });
kernelsInUse().name
```

| value |
| --- |
| smaltml-simd, fused multiply-add |

Where the engine has no relaxed SIMD, the option is ignored and plain SIMD runs. [`simdSupport()`](../reference/simd-support)
says which the engine has.

## Where it runs

WebAssembly SIMD is in Chrome 91, Firefox 89 and Safari 16.4 and later, and in Node. Where it's missing, `useSimd()`
resolves to `false` and smaltml's own kernels stay in use, with the same models and results as ever. If a kernel failed
smaltml's check at start, `useSimd()` also resolves to `false`; that check compares it with smaltml's own on a small
product.

## See also

[`useSimd`](../reference/use-simd), [Threads and bundlers](./threads), [How it works](./how-it-works),
[smaltml's plugins](https://stenhoor.github.io/smaltml/guide/plugins)
