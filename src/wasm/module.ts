/**
 * A WebAssembly module: functions, one memory of its own, and exports (the WebAssembly Core Specification, section
 * 5.5, "Modules"). The plugin's kernels build theirs with it.
 */
import type { Code } from './code.ts';
import { name, section, u32, vec, type ValueType } from './encode.ts';

interface Func {
  name: string;
  params: ValueType[];
  results: ValueType[];
  code: Code;
}

export class ModuleBuilder {
  readonly #funcs: Func[] = [];
  #memoryPages = 0;

  /** A memory of `pages` 64 KiB pages to start with, exported as `memory`; JavaScript grows it as needed. */
  memory(pages: number): this {
    this.#memoryPages = pages;
    return this;
  }

  /** A function, exported under `name`. */
  func(name: string, params: ValueType[], results: ValueType[], code: Code): this {
    this.#funcs.push({ name, params, results, code });
    return this;
  }

  /** The module's bytes: header, then the type, function, memory, export and code sections, in the order required. */
  encode(): Uint8Array<ArrayBuffer> {
    const types = vec(this.#funcs.map((f) => [0x60, ...vec(f.params.map((t) => [t])), ...vec(f.results.map((t) => [t]))]));
    const funcs = vec(this.#funcs.map((_, i) => u32(i)));
    const exports = vec([
      ...this.#funcs.map((f, i) => [...name(f.name), 0x00, ...u32(i)]),
      ...(this.#memoryPages ? [[...name('memory'), 0x02, ...u32(0)]] : []),
    ]);
    const bytes = [
      0x00, 0x61, 0x73, 0x6d, // "\0asm"
      0x01, 0x00, 0x00, 0x00, // version 1
      ...section(1, types),
      ...section(3, funcs),
      ...(this.#memoryPages ? section(5, vec([[0x00, ...u32(this.#memoryPages)]])) : []), // limits: a minimum only
      ...section(7, exports),
      ...section(10, vec(this.#funcs.map((f) => f.code.encode()))),
    ];
    return Uint8Array.from(bytes);
  }
}
