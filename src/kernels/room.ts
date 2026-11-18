/**
 * A kernel's instance and the memory it works in. When a call needs more room, it gets a new, larger memory and a
 * new instance on it: never `memory.grow`, which detaches the memory's old ArrayBuffer. Once any ArrayBuffer is
 * detached, V8 runs every typed-array loop in the process with more checks, for good (a plain loop over a
 * Float64Array took about twice as long, measured), which would slow every other smaltml model that runs after a SIMD
 * kernel. A new memory detaches nothing; the old one is simply dropped.
 */
export class Room<E> {
  readonly #module: WebAssembly.Module;
  #exports!: E;
  #f64!: Float64Array;

  constructor(module: WebAssembly.Module) {
    this.#module = module;
    this.#instantiate(1);
  }

  /** The instance's exports. */
  get exports(): E {
    return this.#exports;
  }

  /** The whole memory, as f64. */
  get f64(): Float64Array {
    return this.#f64;
  }

  /** At least `bytes` of memory, and a view of all of it. */
  reserve(bytes: number): Float64Array {
    if (this.#f64.byteLength < bytes) this.#instantiate(Math.ceil(bytes / 65536));
    return this.#f64;
  }

  #instantiate(pages: number): void {
    const memory = new WebAssembly.Memory({ initial: pages });
    this.#exports = new WebAssembly.Instance(this.#module, { env: { memory } }).exports as unknown as E;
    this.#f64 = new Float64Array(memory.buffer);
  }
}
