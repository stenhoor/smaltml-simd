---
description: 'Every function and option of smaltml SIMD, with the entry point each comes from.'
---

# Reference

From `@smaltworks/smaltml-simd`:

- [`useSimd`](./use-simd): turns the plugin on, with its options (`fusedMultiplyAdd`, `kernelsModule`).
- [`simdSupport`](./simd-support): whether the engine has WebAssembly SIMD and relaxed SIMD.

From `@smaltworks/smaltml-simd/kernels`:

- [The kernels module](./kernels): the kernel set, as smaltml's thread pool workers load it.

To turn the plugin off, and to see which kernels run, use smaltml's
[`useKernels` and `kernelsInUse`](https://stenhoor.github.io/smaltml/reference/use-kernels).
