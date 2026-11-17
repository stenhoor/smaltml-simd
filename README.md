# smaltml SIMD

<a href="https://stenhoor.github.io/smaltml/guide/plugins#smaltml-simd"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/official-smaltml-on-dark.svg"><img alt="smaltml official plugin" src="docs/public/official-smaltml.svg" height="28"></picture></a>
<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="docs/public/work-in-progress.svg" height="56"></picture></a>

WebAssembly SIMD kernels for [smaltml](https://github.com/stenhoor/smaltml), written by TypeScript.

[Documentation](https://stenhoor.github.io/smaltml-simd/) · [Playground](https://stenhoor.github.io/smaltml-simd/playground) · [smaltworks.dev](https://smaltworks.dev)

**smaltml SIMD** (`@smaltworks/smaltml-simd`) is an optional plugin. smaltml is TypeScript, and JavaScript has no SIMD:
its engines run a loop over a `Float64Array` one number at a time. WebAssembly has had 128-bit SIMD in every major
browser since 2021–2023, so this plugin writes smaltml's heaviest kernels, starting with the XᵀX behind the linear
models, as WebAssembly SIMD, and smaltml uses them where the app turns the plugin on. An app that doesn't install it
runs exactly as before. The kernels are TypeScript functions that write the WebAssembly bytes when they run: no
toolchain, no `.wasm` file, nothing loaded from another site.

> **Status: 0.14.0, work in progress.** Four kernels: XᵀX (smaltml's `gramPart`), the matrix product (`matMul`), and
> the logistic objective's row steps, on the plugin's own SIMD exp, log1p and log
> ([ADR 0035](https://github.com/stenhoor/smaltml/blob/main/docs/adr/0035-simd-kernels-in-a-plugin.md)).

## Use

```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { Ridge, kernelsInUse } from '@smaltworks/smaltml';

await useSimd(); // true where WebAssembly SIMD is available; smaltml's own kernels otherwise
const model = await new Ridge().fit(X, y); // XᵀX on SIMD, here and on smaltml's threads
kernelsInUse(); // { name: 'smaltml-simd', kernels: ['gramPart', 'matMul', 'binaryLogisticRows', 'multinomialLogisticRows'], rejected: [] }
```

- `useSimd({ fusedMultiplyAdd: true })` uses relaxed SIMD's fused multiply-add where the engine has it: faster, and
  its last bits can differ between processors. Off by default.
- `useKernels(null)`, from smaltml, turns the plugin off.
- smaltml checks each kernel against its own when the plugin turns on, and doesn't use one that disagrees.
- smaltml's thread pool workers load the same kernels, from this package's `dist/kernels.js`
  (`@smaltworks/smaltml-simd/kernels`), so a fit on several threads still gives exactly what `fitSync` gives. Where a
  bundler has folded that module into the app's bundle, the workers can't load it, and smaltml keeps fits on one
  thread, with the same result. For those apps, copy `dist/smaltml-simd-kernels.js` (the same module in one file, with
  no imports) beside the app, and give its URL: `useSimd({ kernelsModule: '/assets/smaltml-simd-kernels.js' })`.
- `simdSupport()` says whether the engine has WebAssembly SIMD and relaxed SIMD.

## What it changes, and what it doesn't

- **Speed:** the fits built on XᵀX (LinearRegression, Ridge, Lasso, ElasticNet, LogisticRegression with
  `newton-cholesky`), LogisticRegression's default `lbfgs` fits, and smaltml's matrix product on the CPU
  (`matMulSync`, and `matMul` off the GPU). See [the benchmark](bench/README.md) for each model, on one thread and several.
- **The last bits:** SIMD sums in another order, so results are close to smaltml's own, not equal. Agreement with
  scikit-learn doesn't change: CI runs smaltml's compare tests with the plugin on.
- **Not the models or the API.** Saved models are the same either way; fits on several threads still equal `fitSync`.

## Develop

| Command | What it does |
| --- | --- |
| `npm ci` | Installs dependencies, and builds `dist/` |
| `npm run check` | Typecheck on TypeScript 7, then the tests (`node --test`) |
| `npm run build` | `dist/` and type declarations |
| `npm run bench` | Times smaltml's fits with and without the plugin ([bench/README.md](bench/README.md)) |
| `npm run test:browser` | Builds the site and runs every playground in headless Chromium |
| `npm run docs:dev` / `docs:build` | The site |

Node 22.18 or later. MIT licence. Part of the [smaltworks](https://smaltworks.dev) family.
