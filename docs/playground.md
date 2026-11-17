---
description: 'Try smaltml SIMD in your browser: fit Ridge with and without WebAssembly SIMD and compare the times.'
---

# Playground

Fit a Ridge regression with the plugin and without it, in your browser, and compare. Press **Run** (or Ctrl+Enter):
the last line's value is the result. To see the two fits' times on your machine, press **Edit** and end with
`({ simdMs, ownMs })`, or change the size and run again. The times aren't part of the tested result, since they differ
from run to run. The first run also warms the engine up, so run it twice.

```ts
import { useSimd, simdSupport } from '@smaltworks/smaltml-simd';
import { Matrix, Ridge, useKernels } from '@smaltworks/smaltml';

const n = 20_000, p = 60;
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
const X = new Matrix(n, p, Float64Array.from({ length: n * p }, random));
const y = Array.from({ length: n }, (_, i) => X.data[i] + X.data[n + i] + random());

let t = performance.now();
const pluginOn = await useSimd();
const withSimd = new Ridge().fitSync(X, y);
const simdMs = performance.now() - t;
useKernels(null);
t = performance.now();
const withoutSimd = new Ridge().fitSync(X, y);
const ownMs = performance.now() - t;
const largestDifference = Math.max(...withSimd.coef.map((c, j) => Math.abs(c - withoutSimd.coef[j])));
({ simdAvailable: simdSupport().simd, pluginOn, sameToRounding: largestDifference < 1e-12 })
```

| simdAvailable | pluginOn | sameToRounding |
| --- | --- | --- |
| true | true | true |

