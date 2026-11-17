// Bundles one module of dist/ with the modules it imports into a single file with no imports: the module smaltml's
// thread pool workers load (dist/smaltml-simd-kernels.js), which an app copies beside its own bundle when its bundler
// folds the plugin in. Our own, rather than a bundler package: the plugin's modules are few, and tsc emits them in
// one plain shape this script checks for, failing on anything else.
//
// Each imported module becomes a function scope that returns its exports, in dependency order; its imports become
// destructurings of the scopes before it. The entry module stays at the top level, with its own exports.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const IMPORT = /^import \{([^}]*)\} from "(\.{1,2}\/[^"]+\.js)";$/;
const EXPORT = /^export (const|let|function|async function|class) (\w+)/;

/** The bundled source of `entry`, a file of dist/. */
export function bundle(entry) {
  const order = []; // dependencies first, the entry last
  const seen = new Set();
  const visit = (file, stack) => {
    if (stack.includes(file)) throw new Error(`bundle: an import cycle through ${file}`);
    if (seen.has(file)) return;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = IMPORT.exec(line);
      if (m) visit(resolve(dirname(file), m[2]), [...stack, file]);
      else if (/^(import|export \{|export \*)/.test(line)) throw new Error(`bundle: ${file} has a line this bundler doesn't take: ${line}`);
    }
    seen.add(file);
    order.push(file);
  };
  visit(resolve(entry), []);
  const scope = new Map(order.map((f, i) => [f, `__module${i}`]));
  const root = dirname(resolve(entry));
  const out = [`// Bundled from ${order.map((f) => relative(root, f)).join(', ')} by scripts/bundle.mjs.`];
  for (const file of order) {
    const isEntry = file === order[order.length - 1];
    const names = [];
    const body = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('//# sourceMappingURL')).map((line) => {
      const imp = IMPORT.exec(line);
      if (imp) {
        const parts = imp[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^(\w+) as (\w+)$/, '$1: $2'));
        return `const { ${parts.join(', ')} } = ${scope.get(resolve(dirname(file), imp[2]))};`;
      }
      if (isEntry) return line;
      if (line.startsWith('export default')) throw new Error(`bundle: ${file} has a default export, which only the entry may have`);
      const exp = EXPORT.exec(line);
      if (!exp) return line;
      names.push(exp[2]);
      return line.slice('export '.length);
    });
    if (isEntry) out.push(...body);
    else out.push(`const ${scope.get(file)} = (() => {`, ...body, `return { ${names.join(', ')} };`, '})();');
  }
  return out.join('\n') + '\n';
}
