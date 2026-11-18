/**
 * smaltml SIMD: WebAssembly SIMD kernels for smaltml, written by TypeScript in this package (smaltml ADR 0035).
 * @module
 */
import { useKernels } from '@smaltworks/smaltml/core';
import kernelSet, { type SimdOptions } from './kernels.ts';
import { simdSupport } from 'smaltkit/simd';

export { simdSupport, type SimdSupport } from 'smaltkit/simd';
export { type SimdOptions } from './kernels.ts';

/**
 * Turns the plugin on: smaltml's fits use its kernels from now on, in this thread and in smaltml's thread pool.
 * Resolves to `true` when they do, and to `false` where WebAssembly SIMD isn't available, or a kernel failed smaltml's
 * check at start: smaltml's own kernels then stay in use. `useKernels(null)`, from smaltml, turns it off.
 */
export async function useSimd(options: SimdOptions = {}): Promise<boolean> {
  if (!simdSupport().simd) return false;
  const used = useKernels(await kernelSet(options));
  return used.kernels.length > 0;
}
