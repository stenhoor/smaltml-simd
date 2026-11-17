/**
 * The plugin's kernel set, for smaltml's useKernels(). This module is also what the thread pool's workers import
 * (smaltml ADR 0035, item 8): its default export gives them the same set, so it imports nothing from smaltml, and
 * nothing that needs a bundler.
 */
import type { KernelSet } from '@smaltworks/smaltml/core';
import { gramModule, SimdGram } from './kernels/gram.ts';
import { logisticModule, SimdLogistic } from './kernels/logistic.ts';
import { matMulModule, SimdMatMul } from './kernels/matmul.ts';
import { simdSupport } from './support.ts';

/** How the plugin runs. */
export interface SimdOptions {
  /**
   * Fused multiply-add (relaxed SIMD's `f64x2.relaxed_madd`), where the engine has it: faster, with one rounding per
   * multiply-add where the processor fuses them, so the last bits can differ between processors. Off by default.
   */
  fusedMultiplyAdd?: boolean;
  /**
   * Where smaltml's thread pool workers load the plugin's kernels from: by default this module, beside the plugin.
   * Where a bundler folds the plugin into an app's bundle, copy `dist/smaltml-simd-kernels.js` (this module and all
   * it needs, in one file) beside the app, and give its URL here; otherwise the workers can't load the kernels, and
   * fits run on one thread.
   */
  kernelsModule?: string;
}

/** The kernel contract the set is written for: smaltml's KERNELS_VERSION. */
export const KERNELS_VERSION = 1;

/** The set's name, as smaltml's kernelsInUse() reports it. */
export function setName(fused: boolean): string {
  return fused ? 'smaltml-simd, fused multiply-add' : 'smaltml-simd';
}

/**
 * The kernel set: gramPart (XᵀX), matMul (A · B) and the logistic objectives' row steps on WebAssembly SIMD, compiled
 * here. Fused multiply-add only when asked for and the engine
 * has relaxed SIMD. Fails where the engine has no WebAssembly SIMD; useSimd() checks that first.
 */
export default async function kernelSet(options: SimdOptions = {}): Promise<KernelSet> {
  const support = simdSupport();
  if (!support.simd) throw new Error("this engine's WebAssembly has no SIMD");
  const fused = !!options.fusedMultiplyAdd && support.relaxed;
  const [gramMod, matMulMod, logisticMod] = await Promise.all([
    WebAssembly.compile(gramModule(fused)),
    WebAssembly.compile(matMulModule(fused)),
    WebAssembly.compile(logisticModule(fused)),
  ]);
  const gram = new SimdGram(gramMod);
  const product = new SimdMatMul(matMulMod);
  const logistic = new SimdLogistic(logisticMod);
  return {
    name: setName(fused),
    version: KERNELS_VERSION,
    kernels: {
      gramPart: (X, mean, from, to, weights, ones) => gram.gramPart(X, mean, from, to, weights, ones),
      matMul: (n, p, k, a, b) => product.matMul(n, p, k, a, b),
      binaryLogisticRows: (z, y, weights, at, m, loss) => loss + logistic.binaryRows(z, y, weights, at, m),
      multinomialLogisticRows: (z, stride, K, y, weights, at, m, loss) => loss + logistic.multinomialRows(z, stride, K, y, weights, at, m),
    },
    threads: { module: options.kernelsModule ?? import.meta.url, options: { fusedMultiplyAdd: fused } },
  };
}
