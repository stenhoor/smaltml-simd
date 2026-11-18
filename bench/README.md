# Benchmarks

`npm run bench` (`bench/fits.ts`, compiled to JavaScript first) times smaltml's fits three ways:
- with smaltml's own kernels;
- with the plugin's plain SIMD;
- with the plugin's fused multiply-add.

Each runs on one thread (`fitSync`) and on 4 (`fit` with `threads: 4`), and each time is the median of 5 or 9 runs after a warm-up. The data:
- smaltml's benchmark data, from the same seeded generator as smaltml's `bench/data.mjs`: 10,000 × 20 and 200,000 × 50;
- a wider matrix, 50,000 × 200, from the same generator.

The last column is the largest difference of a fit's coefficients from smaltml's own, relative to the largest coefficient.

## 2026-11-17: the first kernel, `gramPart`

> **Corrected 2026-11-18:** measured with `node bench/fits.ts`, run as TypeScript, which slows smaltml's code and the
> plugin's JavaScript (see "2026-11-18" below). The times here are too high, and some speed-ups were wrong;
> the 2026-11-18 tables replace them.

smaltml at `a2cf4e5`, on a cloud VM whose times vary by up to about ±30% between rounds (smaltml ADR 0035, "Noise"). Speed-ups are against smaltml on the same number of threads.

smaltml 0.1.0 with smaltml-simd, Node 22.23.4, Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores); median ms

| Data | Fit | smaltml, 1 thread | SIMD | SIMD, fused | smaltml, 4 threads | SIMD | SIMD, fused | Largest coefficient difference, SIMD (fused) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10k × 20 | LinearRegression | 4.1 | 1.9 (2.2×) | 1.9 (2.1×) | 4.7 | 3.1 (1.5×) | 3.5 (1.3×) | 3.1e-16 (4.2e-16) |
| 10k × 20 | Ridge | 5.3 | 1.5 (3.7×) | 1.3 (4.0×) | 3.7 | 2.6 (1.4×) | 3.2 (1.2×) | 1.5e-15 (1.5e-15) |
| 10k × 20 | Lasso (alpha 0.1) | 4.6 | 1.7 (2.7×) | 1.3 (3.4×) | 4.3 | 2.3 (1.9×) | 2.8 (1.5×) | 1.5e-15 (1.7e-15) |
| 10k × 20 | ElasticNet (alpha 0.1) | 2.8 | 2.2 (1.2×) | 1.2 (2.3×) | 5.2 | 3.0 (1.7×) | 2.4 (2.2×) | 1.3e-15 (1.2e-15) |
| 10k × 20 | LogisticRegression, newton-cholesky | 35 | 19 (1.8×) | 15 (2.4×) | 32 | 29 (1.1×) | 28 (1.1×) | 6.7e-15 (6.0e-15) |
| 200k × 50 | LinearRegression | 298 | 152 (2.0×) | 140 (2.1×) | 163 | 103 (1.6×) | 98 (1.7×) | 4.8e-17 (4.8e-17) |
| 200k × 50 | Ridge | 276 | 146 (1.9×) | 151 (1.8×) | 141 | 80 (1.8×) | 65 (2.2×) | 1.9e-16 (2.9e-16) |
| 200k × 50 | Lasso (alpha 0.1) | 290 | 151 (1.9×) | 154 (1.9×) | 127 | 100 (1.3×) | 73 (1.7×) | 1.9e-16 (1.9e-16) |
| 200k × 50 | ElasticNet (alpha 0.1) | 244 | 152 (1.6×) | 127 (1.9×) | 135 | 77 (1.8×) | 68 (2.0×) | 2.9e-16 (2.9e-16) |
| 200k × 50 | LogisticRegression, newton-cholesky | 2574 | 1177 (2.2×) | 924 (2.8×) | 929 | 561 (1.7×) | 508 (1.8×) | 1.9e-16 (9.6e-17) |
| 50k × 200 | LinearRegression | 709 | 221 (3.2×) | 187 (3.8×) | 300 | 124 (2.4×) | 127 (2.4×) | 4.2e-16 (3.0e-16) |
| 50k × 200 | Ridge | 743 | 184 (4.0×) | 167 (4.4×) | 265 | 112 (2.4×) | 109 (2.4×) | 1.3e-15 (1.6e-15) |
| 50k × 200 | Lasso (alpha 0.1) | 631 | 289 (2.2×) | 174 (3.6×) | 226 | 135 (1.7×) | 100 (2.3×) | 1.6e-15 (1.6e-15) |
| 50k × 200 | ElasticNet (alpha 0.1) | 667 | 174 (3.8×) | 142 (4.7×) | 268 | 110 (2.4×) | 103 (2.6×) | 1.4e-15 (1.1e-15) |
| 50k × 200 | LogisticRegression, newton-cholesky | 6989 | 1873 (3.7×) | 1676 (4.2×) | 2161 | 897 (2.4×) | 723 (3.0×) | 9.1e-14 (5.5e-14) |

### What it shows

- **On one thread, fits are 1.2 to 4.7 times as fast.** The gain grows with the number of columns: XᵀX's work grows with their square. The rest of a fit reads each value once (means, Xᵀy, the solve's inputs), and SIMD doesn't change that.
  - At 200,000 × 50, fits are about twice as fast, though the kernel alone is about 3.3 times as fast. The kernel alone was measured with the probe's method in this session, not by this script.
  - At 50,000 × 200, fits are 3 to 4.7 times as fast.
- **On 4 threads, the gains hold, smaller: 1.1 to 3.0 times** smaltml's own 4-thread fits. This answers ADR 0035's open question 3 for this machine: the gains don't multiply fully with threads.
  - The smallest data gains least, since the workers' messages cost about as much as the work.
- **Fused multiply-add is faster than plain SIMD on most rows of the larger data,** by 5% to 66%. It is 2–3% slower on three of them: Ridge and Lasso at 200,000 × 50 on one thread, and LinearRegression at 50,000 × 200 on 4 threads. Both of those are within the noise. The small data's rows, a few milliseconds each, move the most from run to run.
- **Coefficients move by at most 9 × 10⁻¹⁴** relative to the largest, and by under 2 × 10⁻¹⁵ on all but the logistic fits. That is within rounding: the compare tests against scikit-learn allow 10⁻⁹ to 10⁻⁵.

## 2026-11-17: the matrix product, `matMul`

> **Corrected 2026-11-18:** measured with `node bench/fits.ts`, run as TypeScript, which slows smaltml's code and the
> plugin's JavaScript (see "2026-11-18" below). The times here are too high, and some speed-ups were wrong;
> the 2026-11-18 tables replace them.

`node bench/fits.ts --only-matmul`: smaltml's `matMulSync` with smaltml's kernel, plain SIMD and fused multiply-add,
on one thread. A comes from the same generator, and B has a few columns (as predictions with several targets) or is
square. Same machine and smaltml as above; median ms of 5 or 9 runs.

| Product | smaltml | SIMD | SIMD, fused | Equal to smaltml, SIMD | Largest difference, fused |
| --- | ---: | ---: | ---: | --- | ---: |
| 200k × 50 · 50 × 1 | 40 | 36 (1.1×) | 31 (1.3×) | yes, bit for bit | 4.7e-16 |
| 200k × 50 · 50 × 3 | 113 | 34 (3.3×) | 34 (3.3×) | yes, bit for bit | 4.1e-16 |
| 50k × 200 · 200 × 10 | 333 | 82 (4.1×) | 65 (5.2×) | yes, bit for bit | 4.2e-16 |
| 1,000 × 500 · 500 × 500 | 573 | 91 (6.3×) | 80 (7.2×) | yes, bit for bit | 5.4e-16 |

- **The wider B, the bigger the gain:** each value of A loaded serves four columns of the output. With one column
  (a single prediction), the time goes to reading A, and SIMD gains little: 1.1 times, 1.3 with fused multiply-add.
  With 3 columns or more, 3.3 to 6.3 times; fused, up to 7.2.
- **Plain SIMD gives smaltml's product bit for bit**: each sum adds its products in smaltml's order. Fused
  multiply-add moves it by under 6 × 10⁻¹⁶ of the largest entry.
- Nothing in smaltml's fits calls `matMulSync` today, so the fits above don't change with this kernel.

## 2026-11-17: the logistic row kernels, `logistic: true`

> **Corrected 2026-11-18:** measured with `node bench/fits.ts`, run as TypeScript, which slows smaltml's code and the
> plugin's JavaScript (see "2026-11-18" below). The times here are too high, and some speed-ups were wrong;
> the 2026-11-18 tables replace them.

`node bench/fits.ts --only-logistic`: LogisticRegression's default `lbfgs` fits, 2 and 3 classes, with smaltml's
kernels, plain SIMD and fused multiply-add (`useSimd({ logistic: true })`), on one thread and on 4. Same machine as
above, smaltml at `9ccae2f`; median ms of 3 to 9 runs. All these fits stop at their 100 iterations without converging,
on unscaled data, as smaltml's benchmark fits them.

| Data | Fit | smaltml, 1 thread | SIMD | SIMD, fused | smaltml, 4 threads | SIMD | SIMD, fused | Largest coefficient difference, SIMD (fused) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10k × 20 | LogisticRegression, lbfgs, 2 classes | 92 | 72 (1.3×) | 70 (1.3×) | 108 | 88 (1.2×) | 94 (1.1×) | 3.3e-2 (3.3e-2) |
| 10k × 20 | LogisticRegression, lbfgs, 3 classes | 216 | 219 (1.0×) | 178 (1.2×) | 237 | 216 (1.1×) | 208 (1.1×) | 6.1e-8 (6.1e-8) |
| 200k × 50 | LogisticRegression, lbfgs, 2 classes | 3635 | 3393 (1.1×) | 3423 (1.1×) | 1530 | 1575 (1.0×) | 1494 (1.0×) | 4.1e-3 (4.1e-3) |
| 200k × 50 | LogisticRegression, lbfgs, 3 classes | 9890 | 9006 (1.1×) | 8955 (1.1×) | 3587 | 3599 (1.0×) | 4016 (0.9×) | 2.6e-7 (2.6e-7) |
| 50k × 200 | LogisticRegression, lbfgs, 2 classes | 3120 | 3176 (1.0×) | 3066 (1.0×) | 1160 | 1363 (0.9×) | 1106 (1.0×) | 1.2e-8 (1.2e-8) |
| 50k × 200 | LogisticRegression, lbfgs, 3 classes | 8549 | 9246 (0.9×) | 8758 (1.0×) | 3035 | 3927 (0.8×) | 3872 (0.8×) | 2.4e-3 (2.4e-3) |

- **Little gain:** 1.0 to 1.3 times as fast on one thread, the most on the narrowest data. On 4 threads, 0.8 to 1.2
  times: two of the six fits were slower. Whether that is the VM's noise (about ±30% between rounds) is not known;
  it needs a quieter machine. A fit spends most of its time in X·w and Xᵀ·r, which these kernels don't change
  (smaltml's `bench/exp-share.mjs` measures the share they can touch: 12% to 49%).
- **So they are off by default,** and on only with `useSimd({ logistic: true })` (the owner, 2026-11-17).
- **The large coefficient differences** come from fits that stop early: at the iteration limit, or at `lbfgs`'s
  tolerance. Such a fit is only defined to that tolerance, and the last bits decide where it stops. On standardized
  data, where the fit converges in 12 iterations, coefficients agreed within 6 × 10⁻¹⁶ (10k × 20, 2 classes; a check
  made by hand, not by this script).
  smaltml's compare tests against scikit-learn pass with the kernels on.

## 2026-11-18: TypeScript in Node, and the kernels' memory

### Loading TypeScript slowed the benchmark

In Node, loading any `.ts` file slows some typed-array loops for the rest of the process. A probe loop
(`s += v[i] · c + 0.5` over one Float64Array, in a fresh process each time) took 9 ms, and 20 ms after importing a
one-line `.ts` file; as a `.ts` script itself, 19–24 ms. Not every loop is affected: one over two arrays timed the same
either way. Node's type stripping is the cause (an assumption, not checked: it runs a WebAssembly build of swc, whose
memory grows, and the next section is that effect).

`npm run bench` ran `bench/fits.ts` as TypeScript, so every table above was measured in that state: smaltml's own
kernels and the plugin's JavaScript (the copying around each WebAssembly call) slower than an app sees them. It now
compiles `bench/` and `src/` with tsc into `.bench/` and runs the JavaScript. The plugin's tests still run as
TypeScript: they check results, not times.

### The kernels' memory never grows

Until this change, a kernel grew its WebAssembly memory where a block needed more than it had (`Memory.grow`). Growing
detaches the old buffer, and that slows the same loops, in the whole process or worker, for good: the probe loop took
9–10 ms before a grow and 21–37 ms after. Creating a new memory doesn't. Each kernel now keeps its memory and, where it
needs more, makes a new, larger one with a new instance (`Room`, now in `smaltkit/simd`); `test/memory.test.ts` checks that a
large `gramPart` and `matMul` never call `grow`.

`bench/after-simd.ts` measures what it did to the code that runs after a SIMD fit: a Ridge fit (the plugin's
`gramPart`), then smaltml's own lbfgs and a decision tree, in a process per run, with the plugin before the change,
after it, and none, in turn. smaltml at `a0d321d`, its benchmark data (`--data ../smaltml/bench/data`), 2 runs of each
(`--run`, one at a time, alternating), compiled JavaScript; ms per fit:

| Plugin | Ridge (SIMD) | lbfgs, 2 classes (smaltml's kernels) | DecisionTreeRegressor, depth 10 (smaltml's code) |
| --- | ---: | ---: | ---: |
| Before (`b5b9451`): grows its memory | 94–97 | 2,621–2,623 | 9,499–9,703 |
| After: never grows | 81–85 | 2,150–2,158 | 8,448–8,704 |

With the old plugin, smaltml's own code after a SIMD fit ran slower: lbfgs by 22%, the tree by 9–15%. Run as
TypeScript, the same script showed no difference: both builds ran slowed by TypeScript loading. (These runs were on
the VM before the one below, which the session moved to; the table below was all measured on one.)

### The fits and the product, again

`npm run bench -- --matmul`, compiled JavaScript, after both fixes; smaltml at the plugin's pin (`1852dd4`); a cloud VM
whose times vary by about ±10% between runs. Speed-ups are against smaltml on the same number of threads.

smaltml 0.1.0 with smaltml-simd, Node 22.23.4, Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores); median ms

| Data | Fit | smaltml, 1 thread | SIMD | SIMD, fused | smaltml, 4 threads | SIMD | SIMD, fused | Largest coefficient difference, SIMD (fused) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10k × 20 | LinearRegression | 3.6 | 1.7 (2.1×) | 1.5 (2.4×) | 4.4 | 2.6 (1.7×) | 2.6 (1.7×) | 3.1e-16 (4.2e-16) |
| 10k × 20 | Ridge | 2.8 | 1.4 (2.1×) | 1.1 (2.5×) | 3.2 | 1.8 (1.8×) | 1.6 (2.0×) | 1.5e-15 (1.5e-15) |
| 10k × 20 | Lasso (alpha 0.1) | 2.5 | 1.2 (2.1×) | 1.1 (2.3×) | 3.1 | 2.1 (1.5×) | 1.8 (1.7×) | 1.5e-15 (1.7e-15) |
| 10k × 20 | ElasticNet (alpha 0.1) | 2.3 | 1.2 (2.0×) | 1.1 (2.1×) | 3.0 | 1.8 (1.7×) | 1.5 (2.0×) | 1.3e-15 (1.2e-15) |
| 10k × 20 | LogisticRegression, newton-cholesky | 24 | 14 (1.8×) | 14 (1.8×) | 29 | 24 (1.2×) | 17 (1.8×) | 7.8e-15 (2.6e-15) |
| 10k × 20 | LogisticRegression, lbfgs, 2 classes | 81 | 58 (1.4×) | 59 (1.4×) | 103 | 73 (1.4×) | 79 (1.3×) | 3.3e-2 (3.3e-2) |
| 10k × 20 | LogisticRegression, lbfgs, 3 classes | 203 | 160 (1.3×) | 156 (1.3×) | 207 | 178 (1.2×) | 173 (1.2×) | 6.1e-8 (6.1e-8) |
| 200k × 50 | LinearRegression | 216 | 114 (1.9×) | 110 (2.0×) | 98 | 64 (1.5×) | 56 (1.7×) | 4.8e-17 (4.8e-17) |
| 200k × 50 | Ridge | 196 | 93 (2.1×) | 86 (2.3×) | 88 | 46 (1.9×) | 45 (2.0×) | 1.9e-16 (2.9e-16) |
| 200k × 50 | Lasso (alpha 0.1) | 203 | 96 (2.1×) | 87 (2.3×) | 88 | 49 (1.8×) | 53 (1.7×) | 1.9e-16 (1.9e-16) |
| 200k × 50 | ElasticNet (alpha 0.1) | 208 | 92 (2.3×) | 88 (2.4×) | 84 | 47 (1.8×) | 47 (1.8×) | 2.9e-16 (2.9e-16) |
| 200k × 50 | LogisticRegression, newton-cholesky | 1949 | 897 (2.2×) | 852 (2.3×) | 737 | 405 (1.8×) | 344 (2.1×) | 9.6e-17 (1.9e-16) |
| 200k × 50 | LogisticRegression, lbfgs, 2 classes | 2914 | 2410 (1.2×) | 2456 (1.2×) | 1015 | 875 (1.2×) | 911 (1.1×) | 4.1e-3 (4.1e-3) |
| 200k × 50 | LogisticRegression, lbfgs, 3 classes | 7881 | 7209 (1.1×) | 6979 (1.1×) | 3029 | 2633 (1.2×) | 2452 (1.2×) | 2.6e-7 (2.6e-7) |
| 50k × 200 | LinearRegression | 568 | 199 (2.9×) | 170 (3.3×) | 218 | 95 (2.3×) | 73 (3.0×) | 4.2e-16 (3.0e-16) |
| 50k × 200 | Ridge | 567 | 179 (3.2×) | 154 (3.7×) | 198 | 76 (2.6×) | 74 (2.7×) | 1.3e-15 (1.6e-15) |
| 50k × 200 | Lasso (alpha 0.1) | 543 | 165 (3.3×) | 159 (3.4×) | 226 | 75 (3.0×) | 74 (3.1×) | 1.6e-15 (1.6e-15) |
| 50k × 200 | ElasticNet (alpha 0.1) | 539 | 174 (3.1×) | 144 (3.7×) | 199 | 73 (2.7×) | 65 (3.1×) | 1.4e-15 (1.1e-15) |
| 50k × 200 | LogisticRegression, newton-cholesky | 5340 | 1737 (3.1×) | 1543 (3.5×) | 1895 | 691 (2.7×) | 655 (2.9×) | 1.2e-13 (7.0e-14) |
| 50k × 200 | LogisticRegression, lbfgs, 2 classes | 2323 | 2128 (1.1×) | 2151 (1.1×) | 850 | 779 (1.1×) | 742 (1.1×) | 1.2e-8 (1.2e-8) |
| 50k × 200 | LogisticRegression, lbfgs, 3 classes | 6934 | 6647 (1.0×) | 6680 (1.0×) | 2749 | 2474 (1.1×) | 2498 (1.1×) | 2.4e-3 (2.4e-3) |
| Product | smaltml | SIMD | SIMD, fused | Equal to smaltml, SIMD | Largest difference, fused |

| --- | ---: | ---: | ---: | --- | ---: |
| 200k × 50 · 50 × 1 | 20 | 25 (0.8×) | 22 (0.9×) | yes, bit for bit | 4.7e-16 |
| 200k × 50 · 50 × 3 | 59 | 28 (2.1×) | 24 (2.4×) | yes, bit for bit | 4.1e-16 |
| 50k × 200 · 200 × 10 | 198 | 112 (1.8×) | 84 (2.4×) | yes, bit for bit | 4.2e-16 |
| 1,000 × 500 · 500 × 500 | 386 | 64 (6.0×) | 43 (8.9×) | yes, bit for bit | 5.4e-16 |

- **The least-squares and newton-cholesky fits, with `gramPart`: 1.8 to 3.7 times as fast on one thread,** 1.2 to
  3.1 on 4. The gain grows with the number of columns, as before: about 2× at 200,000 × 50, about 3–3.7× at
  50,000 × 200. The earlier table's top figures (up to 4.7×) don't hold.
- **The logistic row kernels (`logistic: true`): 1.0 to 1.4 times,** none slower now on 4 threads. A fit spends most of
  its time in X·w and Xᵀ·r, which no kernel replaces yet.
- **`matMul` gains much less than the earlier table said.** With one column, as a single prediction, it is **slower**
  than smaltml's: 0.8 times plain, 0.9 fused. With 3 or 10 columns, 1.8 to 2.4 times; square, 6 to 8.9 times. The
  earlier 3.3× and 4.1× were measured with smaltml's kernel slowed.
- Coefficients and products differ from smaltml's as before: the same columns as the earlier tables.
