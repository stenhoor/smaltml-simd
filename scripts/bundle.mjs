// Bundles one module of dist/ with the modules it imports into a single file with no imports: the module smaltml's
// thread pool workers load (dist/smaltml-simd-kernels.js), which an app copies beside its own bundle when its bundler
// folds the plugin in. Our own, rather than a bundler package: the modules are few, and tsc emits them in a few plain
// shapes this script checks for, failing on anything else.
//
// The modules are the plugin's (relative imports) and smaltkit/simd's, which the plugin imports by its package name:
// a bare name is resolved through its package's `exports`, in node_modules beside or above the importing file.
//
// Each imported module becomes a function scope that returns its exports, in dependency order; its imports become
// destructurings of the scopes before it, and its re-exports (`export { a } from`, `export * as ns from`) take their
// values from them the same way. The entry module stays at the top level, with its own exports.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** `import { a, b as c } from '…'`, with either quote. */
const IMPORT = /^import \{([^}]*)\} from (["'])([^"']+)\2;$/;
/** `export { a, b as c } from '…'`. */
const REEXPORT = /^export \{([^}]*)\} from (["'])([^"']+)\2;$/;
/** `export * as ns from '…'`. */
const NAMESPACE = /^export \* as (\w+) from (["'])([^"']+)\2;$/;
const EXPORT = /^export (const|let|function|async function|class) (\w+)/;

/** The file `spec` names, imported from `file`: a relative path, or a package's export found in node_modules. */
function resolveSpec(file, spec) {
  if (spec.startsWith('./') || spec.startsWith('../')) return resolve(dirname(file), spec);
  const [scope, ...rest] = spec.split('/');
  const pkgName = scope.startsWith('@') ? `${scope}/${rest.shift()}` : scope;
  const sub = rest.length ? `./${rest.join('/')}` : '.';
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const pkgDir = join(dir, 'node_modules', pkgName);
    if (existsSync(join(pkgDir, 'package.json'))) {
      const target = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).exports?.[sub];
      const path = typeof target === 'string' ? target : target?.default;
      if (typeof path !== 'string') throw new Error(`bundle: ${pkgName} exports no '${sub}' (imported from ${file})`);
      return resolve(pkgDir, path);
    }
    if (dirname(dir) === dir) throw new Error(`bundle: package ${pkgName} not found from ${file}`);
  }
}

/** `a, b as c` → [['a', 'a'], ['b', 'c']]: each name and what it is called here. */
function names(list) {
  return list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(\w+)(?: as (\w+))?$/.exec(s);
    if (!m) throw new Error(`bundle: a name this bundler doesn't take: ${s}`);
    return [m[1], m[2] ?? m[1]];
  });
}

/** The bundled source of `entry`, a file of dist/. */
export function bundle(entry) {
  const order = []; // dependencies first, the entry last
  const seen = new Set();
  const visit = (file, stack) => {
    if (stack.includes(file)) throw new Error(`bundle: an import cycle through ${file}`);
    if (seen.has(file)) return;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = IMPORT.exec(line) ?? REEXPORT.exec(line) ?? NAMESPACE.exec(line);
      if (m) visit(resolveSpec(file, m[3]), [...stack, file]);
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
    const exported = [];
    const body = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('//# sourceMappingURL')).map((line) => {
      const imp = IMPORT.exec(line);
      if (imp) return `const { ${names(imp[1]).map(([a, b]) => (a === b ? a : `${a}: ${b}`)).join(', ')} } = ${scope.get(resolveSpec(file, imp[3]))};`;
      const re = REEXPORT.exec(line);
      const ns = NAMESPACE.exec(line);
      if ((re || ns) && isEntry) throw new Error(`bundle: the entry ${file} re-exports, which only modules it imports may`);
      if (re) {
        const list = names(re[1]);
        exported.push(...list.map(([, b]) => b));
        return `const { ${list.map(([a, b]) => (a === b ? a : `${a}: ${b}`)).join(', ')} } = ${scope.get(resolveSpec(file, re[3]))};`;
      }
      if (ns) {
        exported.push(ns[1]);
        return `const ${ns[1]} = ${scope.get(resolveSpec(file, ns[3]))};`;
      }
      if (isEntry) return line;
      if (line.startsWith('export default')) throw new Error(`bundle: ${file} has a default export, which only the entry may have`);
      const exp = EXPORT.exec(line);
      if (!exp) return line;
      exported.push(exp[2]);
      return line.slice('export '.length);
    });
    if (isEntry) out.push(...body);
    else out.push(`const ${scope.get(file)} = (() => {`, ...body, `return { ${exported.join(', ')} };`, '})();');
  }
  return out.join('\n') + '\n';
}
