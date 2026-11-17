---
layout: home
hero:
  name: 'sm<span class="alt">alt</span><span class="suffix kit">ml</span> SIMD'
  text: 'WebAssembly SIMD kernels for smaltml.'
  tagline: An optional plugin. Written by TypeScript, on the hardware you have.
  image:
    light: /hardware-mark.svg
    dark: /hardware-mark-on-dark.svg
    alt: smaltml
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: User guide
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/stenhoor/smaltml-simd
features:
  - title: Faster XᵀX and products
    details: LinearRegression, Ridge, Lasso, ElasticNet and newton-cholesky run their XᵀX on 128-bit SIMD, and matMulSync its products. On one 4-core machine, fits ran 1.2 to 4.7 times as fast on one thread.
  - title: The same models and results
    details: Results are close to smaltml's own, not equal, since SIMD sums in another order. Every compare case against scikit-learn still passes, and threaded fits still equal fitSync.
  - title: Written by TypeScript
    details: Each kernel is a TypeScript function that writes the WebAssembly bytes when it runs. No toolchain, no .wasm file, nothing loaded from another site.
  - title: Optional, and checked
    details: An app turns it on with one call. smaltml checks every kernel against its own first, and runs exactly as before where SIMD is missing or the plugin isn't installed.
---

<!-- docs:skip -->
```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { Ridge } from '@smaltworks/smaltml';

await useSimd();
const model = await new Ridge().fit(X, y); // XᵀX on WebAssembly SIMD
```
