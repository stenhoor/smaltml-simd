---
description: 'useSimd: turns smaltml SIMD on, so smaltml''s fits use its WebAssembly SIMD kernels; its options are fusedMultiplyAdd and kernelsModule.'
---

# useSimd

<!-- docs:skip -->
```ts
function useSimd(options?: SimdOptions): Promise<boolean>;

interface SimdOptions {
  fusedMultiplyAdd?: boolean;
  logistic?: boolean;
  kernelsModule?: string;
}
```

Turns the plugin on: smaltml's fits use its kernels from then on, in this thread and in smaltml's thread pool. From
`@smaltworks/smaltml-simd`.

## Parameters

- `fusedMultiplyAdd`: use relaxed SIMD's fused multiply-add (`f64x2.relaxed_madd`) where the engine has it. It is
  faster, and its last bits can differ between processors. Default `false`. Where the engine has no relaxed SIMD, it
  is ignored and plain SIMD runs.
- `logistic`: also replace the logistic objective's row steps, behind LogisticRegression's `lbfgs` fits, with the
  plugin's own exp, log1p and log. Default `false`: on the plugin's benchmark, `lbfgs` fits ran only 1.0 to 1.3 times
  as fast on one thread, and some on 4 threads were slower ([Benchmarks](../guide/benchmarks)).
- `kernelsModule`: the URL smaltml's thread pool workers load the kernels from. Default: the plugin's own
  `kernels.js`, beside `useSimd`. Give it where a bundler folds the plugin into the app: use the URL of a copy of
  `dist/smaltml-simd-kernels.js` ([Threads and bundlers](../guide/threads#apps-that-bundle)).

## Returns

A promise of `true` when smaltml uses the plugin's kernels. It is `false` where the engine has no WebAssembly SIMD,
or where a kernel failed smaltml's check at start; smaltml's own kernels then stay in use. smaltml's `kernelsInUse()`
then reports `name: 'smaltml-simd'`, or `'smaltml-simd, fused multiply-add'`, and `kernels: ['gramPart', 'matMul']`.

## Errors

None of its own. It resolves to `false` rather than failing where the plugin can't run.

## Notes

- It replaces smaltml's kernels through smaltml's `useKernels` (kernel contract 1): `gramPart`, XᵀX over a range of
  rows, and `matMul`, the matrix product on the CPU; with `logistic`, also `binaryLogisticRows` and
  `multinomialLogisticRows`, the logistic objective's row steps. smaltml's other kernels stay its own.
- Calling it again replaces the earlier set, with the new options. smaltml's `useKernels(null)` turns it off.
- Each call compiles the kernel modules, about 700 bytes each, once for this thread and once in each of smaltml's workers
  when the pool next starts.

## Examples

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { kernelsInUse } from '@smaltworks/smaltml';

await useSimd({ fusedMultiplyAdd: true });
kernelsInUse()
```

| name | kernels | rejected |
| --- | --- | --- |
| smaltml-simd, fused multiply-add | [gramPart, matMul, logisticProducts] | [] |

## Working demo

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { Ridge, useKernels } from '@smaltworks/smaltml';

const X = [[1, 0.5], [2, 1.5], [3, 1], [4, 3], [5, 2.5], [6, 4]];
const y = [2, 4.5, 5, 8.5, 9, 12];
await useSimd();
const simd = new Ridge({ alpha: 0.1 }).fitSync(X, y).coef;
useKernels(null);
const own = new Ridge({ alpha: 0.1 }).fitSync(X, y).coef;
({ simd, own, sameToRounding: Math.max(...simd.map((c, j) => Math.abs(c - own[j]))) < 1e-12 })
```

| simd | own | sameToRounding |
| --- | --- | --- |
| [1.14457, 1.18717] | [1.14457, 1.18717] | true |

## See also

[`simdSupport`](./simd-support), [Using the plugin](../guide/), [Threads and bundlers](../guide/threads), smaltml's
[`useKernels`](https://stenhoor.github.io/smaltml/reference/use-kernels)
