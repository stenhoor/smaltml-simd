# smaltml SIMD

<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="docs/public/work-in-progress.svg" height="56"></picture></a>

WebAssembly SIMD kernels for [smaltml](https://github.com/stenhoor/smaltml), written by TypeScript.

**smaltml SIMD** (`@smaltworks/smaltml-simd`) is an optional plugin. smaltml is TypeScript, and JavaScript has no SIMD:
its engines run a loop over a `Float64Array` one number at a time. WebAssembly has had 128-bit SIMD in every major
browser since 2021–2023, so this plugin writes smaltml's heaviest kernels, starting with the XᵀX behind the linear
models, as WebAssembly SIMD, and smaltml uses them where the app turns the plugin on. An app that doesn't install it
runs exactly as before. The kernels are TypeScript functions that write the WebAssembly bytes when they run: no
toolchain, no `.wasm` file, nothing loaded from another site.

> **Status: 0.14.0, work in progress.** The repository is set up; the kernels come next
> ([ADR 0035](https://github.com/stenhoor/smaltml/blob/main/docs/adr/0035-simd-kernels-in-a-plugin.md), step 4).
> Today it reports what the engine supports:

```ts
import { simdSupport } from '@smaltworks/smaltml-simd';

simdSupport(); // { simd: true, relaxed: true } in Node 22; relaxed is false in browsers without relaxed SIMD
```

## What it will change, and what it won't

From ADR 0035, to be measured by this repository's benchmark as each kernel lands:

- **Speed:** the fits built on XᵀX (LinearRegression, Ridge, Lasso, ElasticNet, LogisticRegression with
  `newton-cholesky`). A probe of the first kernel ran 3.5 to 5 times as fast as smaltml's TypeScript, on one machine;
  its benchmark moves here with that kernel.
- **The last bits:** SIMD sums in another order, so results are close to smaltml's own, not equal. Agreement with
  scikit-learn doesn't change: smaltml's compare tests run with the plugin on.
- **Not the models or the API.** Saved models are the same either way; fits on several threads still equal `fitSync`.

## Develop

| Command | What it does |
| --- | --- |
| `npm ci` | Installs dependencies, and builds `dist/` |
| `npm run check` | Typecheck on TypeScript 7, then the tests (`node --test`) |
| `npm run build` | `dist/` and type declarations |

Node 22.18 or later. MIT licence. Part of the [smaltworks](https://smaltworks.dev) family.
