---
description: 'How smaltml SIMD writes its WebAssembly from TypeScript, and how its kernels work: blocks, tiles and two rows at a time.'
---

# How it works

## Written by TypeScript

The smalt family is TypeScript. The plugin is the one place smaltml uses WebAssembly, because it is the platform's only
route to SIMD (smaltml [ADR 0035](https://stenhoor.github.io/smaltml/adr/0035-simd-kernels-in-a-plugin);
smaltworks' rule "WebAssembly: plugins only"). Even so, the plugin has no WebAssembly source file, no compiler and no
`.wasm` file. Each kernel is a TypeScript function that writes the module's bytes when it runs, instruction by
instruction:

- `src/wasm/encode.ts`: the binary format's numbers (LEB128), names, vectors and sections.
- `src/wasm/code.ts`: one method per instruction a kernel uses, such as `v128Load()` or `f64x2Mul()`. Each writes
  that instruction's bytes, with a comment saying which instruction it is.
- `src/wasm/module.ts`: a module with its own memory, its functions and their exports.

So every byte that runs is written by code in the repository, where it can be read and reviewed. Each kernel's module is
about 700 bytes.

<!-- docs:skip -->
```ts
// From src/kernels/gram.ts: sum += x · y, two rows at a time, plain or fused.
const madd = (sum, x, y) =>
  fused ? c.get(x).get(y).get(sum).f64x2RelaxedMadd().set(sum) : c.get(sum).get(x).get(y).f64x2Mul().f64x2Add().set(sum);
```

## The XᵀX kernel

It works as smaltml's own `gramPart` does, and gives its result to rounding:

1. **Blocks of 512 rows.** JavaScript copies a block's columns into the module's memory, subtracting each column's
   mean and multiplying by √weight as it goes. A block of a few hundred columns stays in the processor's cache.
2. **A 2 × 4 tile at a time.** For two columns j and j + 1 of the lower triangle against four columns k to k + 3,
   eight sums stay in registers through the whole block.
3. **Two rows at a time.** Each sum is an `f64x2`: the even rows in one lane, the odd rows in the other. Each pass
   over the block loads six pairs and makes eight multiply-adds. The two lanes are added once, at the end of the
   block.

Columns are padded with zeros to a multiple of 4, and a block's rows to an even number, so the tiles need no
remainder loops. Compiled WebAssembly also skips the bounds and type checks the JavaScript engine makes on every
array read. That is why the kernel runs more than twice as fast, though an `f64x2` carries only two numbers.

## The matrix product

A · B, with A n × p and B p × k, column by column as smaltml keeps them:

1. **A 4 × 4 tile of the output at a time:** four rows, as two `f64x2`, against four columns, so sixteen sums sit in
   eight registers.
2. **One step per l, over the whole inner size:** load two pairs from A's column l, splat four of B's values, and
   make eight multiply-adds.
3. **Rows padded to a multiple of 4, and the output's columns too,** with zeros, so the tiles need no remainder loops.

Each sum adds its products in the order of l, from 0, as smaltml's own loop does. So under plain SIMD the product is
smaltml's own bit for bit; only fused multiply-add moves it, within rounding. The gain comes from the tiles: each
value of A that is loaded serves four columns of the output.

## Checked twice

- **By the plugin's tests**, against plain loops, on sizes from 1 × 1 up, with means, weights and a column of ones:
  within 10⁻¹³ of each entry's scale.
- **By smaltml, at start:** `useKernels` runs each kernel on a small product, compares it with its own, and doesn't
  use one that differs by more than 10⁻¹² of the entries' scale or writes to its input.

## See also

[Using the plugin](./), [Benchmarks](./benchmarks), [the source](https://github.com/stenhoor/smaltml-simd/tree/main/src)
