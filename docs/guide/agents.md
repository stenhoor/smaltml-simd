---
description: 'For AI agents that write code with smaltml SIMD: how to use it, its rules, and where the complete agent guide is.'
---

# For AI agents

This page is written for AI agents that write code with smaltml SIMD, and it opens the agent guide. The site publishes
Markdown made for agents beside its pages:

- [`/agents.md`](https://stenhoor.github.io/smaltml-simd/agents.md): this page, then the reference, in one file. Every
  example in it is tested, with its result.
- [`/llms.txt`](https://stenhoor.github.io/smaltml-simd/llms.txt): an index of every page, each as Markdown.

## What it is

smaltml SIMD (`@smaltworks/smaltml-simd`, not on npm yet) is an optional plugin for smaltml
(`@smaltworks/smaltml`). It runs two of smaltml's kernels on WebAssembly SIMD. XᵀX makes the fits built on it faster:
LinearRegression, Ridge, Lasso, ElasticNet, and LogisticRegression with `solver: 'newton-cholesky'`. The matrix
product makes `matMulSync` faster, with smaltml's result bit for bit under plain SIMD. It has no runtime
dependencies; smaltml is a peer dependency.

## How to use it

<!-- docs:skip -->
```ts
import { useSimd, simdSupport } from '@smaltworks/smaltml-simd';
import { Ridge, kernelsInUse, useKernels } from '@smaltworks/smaltml';

const on = await useSimd();              // false where WebAssembly SIMD is missing: smaltml's own kernels run
const model = await new Ridge().fit(X, y);
kernelsInUse();                          // { name: 'smaltml-simd', kernels: ['gramPart', 'matMul'], rejected: [] }
useKernels(null);                        // off again
```

## Rules

- **Call `useSimd()` once, before fitting.** It applies to every later fit, in this thread and in smaltml's thread
  pool. Await it.
- **Don't expect equal last bits.** With the plugin, coefficients differ from smaltml's own by about 10⁻¹⁵ relative.
  Compare results with a tolerance, not `===`.
- **A fit on several threads equals `fitSync`** with the plugin on, as without it.
- **Fused multiply-add** (`useSimd({ fusedMultiplyAdd: true })`) is faster, and its last bits can differ between
  processors. Leave it off where results must match across machines.
- **Bundled apps:** pass `kernelsModule`, the URL of a copy of `dist/smaltml-simd-kernels.js`; without it, fits on
  several threads fall back to one thread ([Threads and bundlers](./threads)).
- **It doesn't change** the models, their options, saved models, or what is supported: smaltml's own reference and
  errors apply.

## Reference

The reference follows: [`useSimd`](../reference/use-simd), [`simdSupport`](../reference/simd-support), and
[the kernels module](../reference/kernels).
