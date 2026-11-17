// A vitest setup file for smaltml's own test suite, run in a checkout of smaltml with the plugin on (smaltml ADR 0035,
// item 7): every compare case against scikit-learn must still pass within its tolerance, and threaded fits must still
// equal fitSync. CI runs, from smaltml's directory:
//
//   npx vitest run test/compare.test.ts test/parallel.test.ts --setupFiles ../smaltml-simd/test/smaltml-setup.ts
//
// smaltml's vitest config maps @smaltworks/smaltml to its source, so the plugin turns on the same smaltml the tests use.
import { kernelsInUse } from '@smaltworks/smaltml/core';
import { useSimd } from '../src/index.ts';

const fusedMultiplyAdd = process.env.SMALTML_SIMD_FMA === '1';
if (!(await useSimd({ fusedMultiplyAdd }))) throw new Error('smaltml-simd did not turn on: WebAssembly SIMD is missing, or a kernel failed the check');
const used = kernelsInUse();
if (used.kernels.join() !== 'gramPart') throw new Error(`smaltml-simd: unexpected kernels in use: ${JSON.stringify(used)}`);
