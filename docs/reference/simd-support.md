---
description: 'simdSupport: whether the JavaScript engine''s WebAssembly has 128-bit SIMD, and relaxed SIMD for fused multiply-add.'
---

# simdSupport

<!-- docs:skip -->
```ts
function simdSupport(): SimdSupport;

interface SimdSupport {
  simd: boolean;
  relaxed: boolean;
}
```

Whether this engine's WebAssembly has 128-bit SIMD, which the plugin needs, and relaxed SIMD, which fused multiply-add
needs. From `@smaltworks/smaltml-simd`.

## Parameters

None.

## Returns

- `simd`: `true` where WebAssembly has 128-bit SIMD: Chrome 91, Firefox 89, Safari 16.4 and later, and Node.
- `relaxed`: `true` where it also has relaxed SIMD, such as Chrome 114 and later, and Node 22.

## Errors

None. Where there is no WebAssembly at all, both are `false`.

## Notes

It compiles and runs nothing. It asks the engine to validate two modules of a few bytes, each using one instruction:
`v128.const` for SIMD, and `f64x2.relaxed_madd` for relaxed SIMD. The plugin writes their bytes out one by one, in
`src/support.ts`. `useSimd()` calls it first.

## Examples

```ts
import { simdSupport } from '@smaltworks/smaltml-simd';

simdSupport()
```

| simd | relaxed |
| --- | --- |
| true | true |

## Working demo

```ts
import { simdSupport } from '@smaltworks/smaltml-simd';

const { simd, relaxed } = simdSupport();
simd ? (relaxed ? 'SIMD, and fused multiply-add' : 'SIMD') : "smaltml's own kernels"
```

| value |
| --- |
| SIMD, and fused multiply-add |

## See also

[`useSimd`](./use-simd), [Using the plugin](../guide/#where-it-runs)
