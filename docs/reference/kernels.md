---
description: 'The kernels module, @smaltworks/smaltml-simd/kernels: the kernel set smaltml uses, and the module its thread pool workers load.'
---

# The kernels module

<!-- docs:skip -->
```ts
// @smaltworks/smaltml-simd/kernels (dist/smaltml-simd-kernels.js): one file, no imports.
export default function kernelSet(options?: SimdOptions): Promise<KernelSet>;
export const KERNELS_VERSION: 1;
```

The kernel set the plugin gives smaltml's `useKernels`. smaltml's thread pool workers also load it, by URL. Most apps
never import it: [`useSimd`](./use-simd) does.

## Parameters

- `options`: as `useSimd`'s (`fusedMultiplyAdd`, `kernelsModule`). The workers receive the same options.

## Returns

A promise of smaltml's `KernelSet`:

- `name`: `'smaltml-simd'`, or `'smaltml-simd, fused multiply-add'` where fused multiply-add is on and the engine has
  relaxed SIMD.
- `version`: 1, the kernel contract it is written for (smaltml's `KERNELS_VERSION`).
- `kernels.gramPart`: XᵀX on WebAssembly SIMD, with smaltml's `gramPart` signature. It takes
  `(X, mean, from, to, weights?, ones?)` and gives the lower triangle of (X − mean)ᵀ diag(weights) (X − mean) over
  rows `from` to `to`, row by row.
- `kernels.matMul`: A · B on WebAssembly SIMD, with smaltml's `matMul` kernel signature. It takes `(n, p, k, a, b)`,
  A n × p and B p × k as Float64Arrays column by column, and gives the n × k product, column by column. Under plain
  SIMD it is smaltml's own result bit for bit.
- `kernels.binaryLogisticRows` and `kernels.multinomialLogisticRows`: the logistic objective's row steps, with
  smaltml's signatures. They take a block's scores, and return the running loss plus the block's, with the scores
  replaced by their residuals. They use the plugin's own exp, log1p and log, within a few rounding steps of
  JavaScript's.
- `threads`: the module's own URL, or `kernelsModule`, with the options. This is how smaltml's workers load it.

## Errors

It fails where the engine has no WebAssembly SIMD. `useSimd()` checks first and resolves to `false` instead.

## Notes

- The module imports nothing from smaltml, and as `smaltml-simd-kernels.js` nothing at all. A worker can load it by
  URL alone, wherever it is copied.
- `scripts/bundle.mjs`, the plugin's own, writes the single-file copy when the package is built.

## Examples

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { kernelsInUse } from '@smaltworks/smaltml';

await useSimd();
kernelsInUse().kernels
```

| value |
| --- |
| gramPart |
| matMul |
| binaryLogisticRows |
| multinomialLogisticRows |

## Working demo

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { LinearRegression, kernelsInUse } from '@smaltworks/smaltml';

await useSimd();
const model = new LinearRegression().fitSync([[1, 1], [2, 3], [3, 2], [4, 5], [5, 4]], [4, 9, 8, 15, 14]);
({ kernels: kernelsInUse().name, coef: model.coef, intercept: model.intercept })
```

| kernels | coef | intercept |
| --- | --- | --- |
| smaltml-simd | [1, 2] | 1 |

## See also

[`useSimd`](./use-simd), [Threads and bundlers](../guide/threads#apps-that-bundle), smaltml's
[`useKernels`](https://stenhoor.github.io/smaltml/reference/use-kernels)
