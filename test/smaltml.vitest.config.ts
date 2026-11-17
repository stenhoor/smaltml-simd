// The vitest config that runs smaltml's own tests with the plugin on (test/smaltml-setup.ts): smaltml's config, plus the
// setup file. From a checkout of smaltml (SMALTML_DIR, by default beside this repository's checkout):
//
//   npx vitest run --root . --config ../smaltml-simd/test/smaltml.vitest.config.ts test/compare.test.ts test/parallel.test.ts test/hardware.test.ts
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export default async () => {
  const smaltml = resolve(process.env.SMALTML_DIR ?? fileURLToPath(new URL('../../smaltml', import.meta.url)));
  const base = (await import(pathToFileURL(resolve(smaltml, 'vitest.config.ts')).href)).default as { test?: object };
  return { ...base, test: { ...base.test, setupFiles: [fileURLToPath(new URL('./smaltml-setup.ts', import.meta.url))] } };
};
