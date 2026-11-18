# CLAUDE.md

smaltml-simd (repository `stenhoor/smaltml-simd`, npm `@smaltworks/smaltml-simd`, shown as "smaltml SIMD") is an
optional plugin for smaltml: WebAssembly SIMD kernels that replace smaltml's heaviest CPU kernels, written by
TypeScript in this repository. Its scope and design are smaltml's
[ADR 0035](https://github.com/stenhoor/smaltml/blob/main/docs/adr/0035-simd-kernels-in-a-plugin.md). It is part of the
smalt family: smaltworks' [STANDARDS.md](https://github.com/stenhoor/smaltworks/blob/main/STANDARDS.md) and
[session rules](https://github.com/stenhoor/smaltworks/blob/main/context/session-rules.md) apply here, and smaltml's
CLAUDE.md has the rules for its kernels.

## Why WebAssembly here

The family is TypeScript, and the core has no WebAssembly. This plugin is the exception the owner allowed on
2026-11-15 (smaltworks DECISIONS.md, "WebAssembly: plugins only"): JavaScript has no SIMD, and WebAssembly is the
platform's one route to it. It holds only while all five circumstances there hold:

1. No TypeScript route exists to the capability, not merely a faster one.
2. It's optional: smaltml works without it, in TypeScript, only slower.
3. It's our own code, built from source here: no WebAssembly builds of other libraries.
4. It's narrow: kernels behind a TypeScript interface, not an application in another language.
5. It's revisited when the platform offers a TypeScript or JavaScript route, and retired if it can be.

## Brand

An infrastructure plugin (ADR 0035, item 10; smalt-brand BRAND.md, "Plugins"): smaltml's brand and a plain name,
"smaltml SIMD", with no mark or colour of its own. Its README carries the Official plugin badge with smaltml's mark,
(smalt-brand `badges/plugins/official-smaltml.svg`), linking to smaltml's Plugins page; the site shows it at the foot
of every page, beside "A smaltworks project" (the owner, 2026-11-17: `docs/.vitepress/config.ts` and the site's own
`theme/official.ts`, since the kit's files stay unchanged). Copy brand files unchanged
from smalt-brand: the site kit (`docs/.vitepress/theme/{shiki.ts,smaltdb.css,smaltworks.ts,stage.ts,playground.ts,agents.ts}`
from `themes/vitepress/`), smaltml's logos (`logos/smaltml/`) and the badges, into `docs/public/`.

## Workflow

The family's rules: one task per branch and pull request; open it once CI passes; the owner merges. Before pushing,
`npm run check`, and `npm run test:browser` when the docs or the runner change.

The site (https://stenhoor.github.io/smaltml-simd/) deploys from `.github/workflows/docs.yml` only: the repository's
Settings → Pages → Source must be **GitHub Actions**.

- **Facts only.** Don't tell the owner something you haven't confirmed. Label everything else as an assumption, in
  those words, with what would confirm it.
- **Watch your PRs to the merge,** through their events, never by polling. Merging stays with the owner.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Installs dependencies, and builds `dist/` |
| `npm run check` | Typecheck (TypeScript 7, the `typescript7` dev dependency), then the tests (`node --test`, on the TypeScript source: Node 22.18 and later strip its types) |
| `npm run test:browser` | Builds the site and presses Run on every playground in headless Chromium (`test/browser/docs.mjs`). CI runs it |
| `npm run docs:dev` / `docs:build` | The site (VitePress). Its examples run in place (`docs/.vitepress/theme/simd.ts`); `test/docs.test.ts` checks the table under each, and `UPDATE_DOCS=1 npm test` writes them |
| `npm run build` | `dist/` and type declarations, emitted by TypeScript 6.0.3 (`tsc`) for one more release (smaltty ADR 0030, decision 5) |
| `npm run bench` | Times smaltml's fits with smaltml's kernels, the plugin's, and the plugin's with fused multiply-add, on one thread and on several (`bench/fits.ts`). Rerun after kernel work, and update `bench/README.md` |
| smaltml's tests with the plugin on | From a checkout of smaltml beside this one: `npx vitest run --root . --config ../smaltml-simd/test/smaltml.vitest.config.ts test/compare.test.ts test/parallel.test.ts test/hardware.test.ts` (`SMALTML_SIMD_FMA=1` for fused multiply-add). CI runs both |

## Rules

- **TypeScript writes the WebAssembly** (ADR 0035, item 5). Kernels are TypeScript functions that emit the module's
  bytes at run time: no compiler toolchain, no `.wasm` file, nothing loaded from another site. Every instruction is
  written by our own code, with a comment that says what it is: the kernels here, through smaltkit's WebAssembly
  writer, `smaltkit/simd` (moved there from this repository's `src/wasm/`, the owner's decision 2026-11-18). Rust
  was considered on 2026-11-17 and not chosen; changing that is an amendment to ADR 0035.
- **Erasable TypeScript only** (`erasableSyntaxOnly`): no enums, namespaces or parameter properties, so Node runs the
  source as it is. Relative imports name the `.ts` file; the build rewrites them to `.js`.
- **smaltml's kernel contract is the interface.** The plugin replaces kernels only through smaltml's `useKernels`, with
  the signatures and results of smaltml's own, for the contract version it was written for (`KERNELS_VERSION`).
  smaltml checks each kernel at start against its own.
- **Close, not equal** (ADR 0035, item 7). SIMD sums in another order, so results move in the last bits. Every compare
  case of smaltml against scikit-learn still passes within its tolerance, with the plugin on; CI runs them. Threaded
  fits equal `fitSync` exactly: the thread pool's workers load the same kernels.
- **Plain SIMD by default.** Fused multiply-add (relaxed SIMD) only when the app asks for it, where the engine has it:
  its last bits can differ between processors (ADR 0035, item 6).
- **No number without its benchmark.** A speed claim names the benchmark that measured it, which anyone can rerun.
- **Dependencies:** smaltml is a peer dependency, pinned to a commit for development, as the family pins its git
  dependencies. One runtime dependency: smaltkit, the family's shared kit, pinned to a commit, for `smaltkit/simd`
  (the owner, 2026-11-18). Dev dependencies: TypeScript (6.0.3 and 7), `@types/node`, and for the site vitepress and
  playwright (1.64.1, CI's version), the owner's yes on 2026-11-17. Ask the owner before adding any other package.
- **Every ```` ```ts ```` block in `docs/` runs where it stands,** in the kit's playground with this site's runner.
  A tested result can't hold a time: timings differ from run to run, so pages show them only when a reader edits an
  example. `<!-- docs:skip -->` marks a block that isn't run (signatures, sketches).
- **Layout:** `src/kernels/` holds one kernel per file, its module (written with `smaltkit/simd`: instructions,
  modules, `Room` for memory, and `simdMath`, our own f64x2 exp, log1p and ln, tested in smaltkit) and the JavaScript
  that feeds it; `src/kernels.ts` is the kernel set, and the module smaltml's thread pool workers import, so it
  imports nothing from smaltml; `src/index.ts` is `useSimd()`.
  `scripts/bundle.mjs`, our own, writes `dist/smaltml-simd-kernels.js`: that module and what it imports, in one file,
  for apps whose bundler folds the plugin in, smaltkit/simd's modules included. It takes only the plain imports,
  exports and re-exports tsc emits, and fails on anything else.
- **A new kernel** needs smaltml's contract to name it first (smaltml's `useKernels`), tests against plain loops on odd
  sizes (`test/`), a row in the benchmark, and the compare tests passing with it on.
- A significant decision gets an ADR, numbered in the family's sequence (smaltworks `adr/README.md`).
