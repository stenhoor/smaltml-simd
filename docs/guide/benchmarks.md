---
description: 'smaltml SIMD benchmarks: smaltml fits with smaltml''s own kernels, the plugin''s, and fused multiply-add, on one thread and four.'
---

# Benchmarks

The plugin's numbers come from one script, `npm run bench` (`bench/fits.ts`), which anyone can rerun. It times
smaltml's fits three ways: with smaltml's own kernels, with the plugin's plain SIMD, and with its fused multiply-add.
Each runs on one thread (`fitSync`) and on 4 (`fit` with `threads: 4`), and each time is the median of 5 or 9 runs
after a warm-up.

The data is smaltml's benchmark data, from the same seeded generator: 10,000 × 20 and 200,000 × 50. A wider matrix,
50,000 × 200, comes from the same generator. The last column is the largest difference of a fit's coefficients from
smaltml's own, relative to the largest coefficient.

## 2026-11-17: the first kernel, `gramPart`

smaltml at `a2cf4e5`, Node 22.23, on a 4-core Intel Xeon cloud VM whose times vary by up to about ±30% between rounds.
Times are in milliseconds, and each speed-up is against smaltml on the same number of threads.

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

- **On one thread, fits are 1.2 to 4.7 times as fast.** The gain grows with the number of columns.
- **On 4 threads, the gains hold, smaller: 1.1 to 3.0 times.** The smallest data gains least: there the workers'
  messages cost about as much as the work.
- **Fused multiply-add** is faster than plain SIMD on most rows of the larger data, by 5% to 66%.
- **Coefficients move by at most 9 × 10⁻¹⁴** relative to the largest, and by under 2 × 10⁻¹⁵ outside the logistic
  fits. That is within rounding: smaltml's compare tests against scikit-learn allow 10⁻⁹ to 10⁻⁵.

## 2026-11-17: the matrix product, `matMul`

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

The same results, with the method, are in the repository's
[bench/README.md](https://github.com/stenhoor/smaltml-simd/blob/main/bench/README.md).
