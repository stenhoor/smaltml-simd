# Benchmarks

`npm run bench` (`bench/fits.ts`) times smaltml's fits three ways:
- with smaltml's own kernels;
- with the plugin's plain SIMD;
- with the plugin's fused multiply-add.

Each runs on one thread (`fitSync`) and on 4 (`fit` with `threads: 4`), and each time is the median of 5 or 9 runs after a warm-up. The data:
- smaltml's benchmark data, from the same seeded generator as smaltml's `bench/data.mjs`: 10,000 × 20 and 200,000 × 50;
- a wider matrix, 50,000 × 200, from the same generator.

The last column is the largest difference of a fit's coefficients from smaltml's own, relative to the largest coefficient.

## 2026-11-17: the first kernel, `gramPart`

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
