// Builds dist/: the JavaScript and its type declarations, emitted by TypeScript 6.0.3 (`tsc`) for one more release, the
// family's rule (smaltty ADR 0030, decision 5). Each source file becomes one ES module; the workers' module is also
// bundled into one file with no imports.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { bundle } from './bundle.mjs';

rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
// The workers' module, self-contained (scripts/bundle.mjs).
writeFileSync('dist/smaltml-simd-kernels.js', bundle('dist/kernels.js'));
console.log('built dist/ and dist/smaltml-simd-kernels.js');
