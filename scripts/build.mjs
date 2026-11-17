// Builds dist/: the JavaScript and its type declarations, emitted by TypeScript 6.0.3 (`tsc`) for one more release, the
// family's rule (smaltty ADR 0030, decision 5). Each source file becomes one ES module; there is nothing to bundle.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
console.log('built dist/');
