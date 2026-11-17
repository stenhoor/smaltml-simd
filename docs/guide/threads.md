---
description: 'smaltml SIMD on several cores: the thread pool loads the same kernels, and what an app whose bundler folds the plugin in needs to do.'
---

# Threads and bundlers

smaltml's large fits run on several cores, in workers that share X's memory
([smaltml's hardware guide](https://stenhoor.github.io/smaltml/guide/hardware#on-several-cores)). A fit on any number
of threads gives exactly what `fitSync` gives. With the plugin on, that still holds, because every worker uses the
same kernels:

1. `useSimd()` gives smaltml the plugin's kernels, and names the module they come from: `kernels.js`, beside the
   plugin.
2. When smaltml's thread pool starts, each worker imports that module, compiles the kernels, and uses them.
3. If any worker can't, the pool doesn't start. Fits then run on one thread, with the same result, only slower.

Each call to `useSimd()` or `useKernels()` restarts the pool at the next fit, so its workers always match.

## Apps that bundle

The workers load the kernels' module by its URL. Where an app's bundler keeps the plugin's files as they are (Node,
or a page that loads modules as they are published), that just works. Where the bundler folds the plugin into the
app's own bundle, the module isn't at its URL any more, and fits run on one thread.

For those apps the plugin ships the same module as one file with no imports: `dist/smaltml-simd-kernels.js`, also
exported as `@smaltworks/smaltml-simd/kernels`. Copy it beside the app, as you do smaltml's workers' script, and give
its URL:

<!-- docs:skip -->
```ts
import { useSimd } from '@smaltworks/smaltml-simd';
import { configureThreads } from '@smaltworks/smaltml';

configureThreads({ script: '/assets/smaltml-threads.js' }); // smaltml's workers
await useSimd({ kernelsModule: new URL('/assets/smaltml-simd-kernels.js', location.href).href });
```

The plugin's own script, `scripts/bundle.mjs`, writes that file when the package is built. It is our own short
bundler, not an outside package.

## Threads need shared memory

As for smaltml without the plugin: Node always has it, and a browser has it only on a cross-origin isolated page.
Elsewhere, fits run on one thread. This site isn't cross-origin isolated, so its playgrounds run on one thread.

## See also

[`useSimd`](../reference/use-simd) (`kernelsModule`), [The kernels module](../reference/kernels),
[Benchmarks](./benchmarks) (on 4 threads)
