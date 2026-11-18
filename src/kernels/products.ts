/**
 * The logistic objectives' products on WebAssembly SIMD (smaltml's logisticProducts kernel): X·w, the scores, and
 * Xᵀr, the gradient's sums, for one fit. X is copied once, when the fit starts, into the kernel's memory, and every
 * evaluation reads it there: copying it on each evaluation would cost more than the products themselves, since a pass
 * over X is bound by memory, not arithmetic. The row step between the two products is the one smaltml passes in.
 *
 * Rows in blocks of 512, as smaltml's: X·w for a block, then the row step, then Xᵀr while the block is in cache. Four
 * columns a pass, two rows a vector (f64x2). X's columns are padded to an even number of rows, and with zero columns
 * to a multiple of 4, so the loops need no remainders. X·w adds each row's four products in smaltml's order; Xᵀr
 * sums even and odd rows apart, then adds them, so results agree with smaltml's in all but the last bits.
 */
import { Code, I32, ModuleBuilder, Room, V128 } from 'smaltkit/simd';

/** Rows per block, as smaltml's. */
const BLOCK = 512;

/** The largest memory a module can have: 65,536 pages of 64 KiB. */
const MAX_BYTES = 65536 * 65536;

/** `xw(x, stride, mbytes, p4, w, z)`: z[i] += Σ_j x_j[i] · w[j], over p4 columns `stride` bytes apart, mbytes / 8 rows. */
function xw(fused: boolean): Code {
  const c = new Code(6);
  const [X, stride, mbytes, p4, W, Z] = [0, 1, 2, 3, 4, 5];
  const j = c.local(I32);
  const i = c.local(I32);
  const col = [c.local(I32), c.local(I32), c.local(I32), c.local(I32)];
  const w = [c.local(V128), c.local(V128), c.local(V128), c.local(V128)];
  const t = c.local(V128);
  c.i32(0).set(j);
  c.block().loop(); // for (j = 0; j < p4; j += 4)
  c.get(j).get(p4).i32GeU().brIf(1);
  c.get(X).get(j).get(stride).i32Mul().i32Add().set(col[0]!);
  for (let q = 1; q < 4; q++) c.get(col[q - 1]!).get(stride).i32Add().set(col[q]!);
  // w[j + q] in both lanes
  for (let q = 0; q < 4; q++) c.get(W).get(j).i32(8).i32Mul().i32Add().f64Load(q * 8).f64x2Splat().set(w[q]!);
  c.i32(0).set(i);
  c.loop(); //   do { … } while ((i += 16) < mbytes): two rows a pass
  // t = x0·w0 + x1·w1 + x2·w2 + x3·w3, in that order; then z += t
  c.get(col[0]!).get(i).i32Add().v128Load().get(w[0]!).f64x2Mul().set(t);
  for (let q = 1; q < 4; q++) {
    if (fused) c.get(col[q]!).get(i).i32Add().v128Load().get(w[q]!).get(t).f64x2RelaxedMadd().set(t);
    else c.get(t).get(col[q]!).get(i).i32Add().v128Load().get(w[q]!).f64x2Mul().f64x2Add().set(t);
  }
  c.get(Z).get(i).i32Add().get(Z).get(i).i32Add().v128Load().get(t).f64x2Add().v128Store();
  c.get(i).i32(16).i32Add().tee(i).get(mbytes).i32LtU().brIf(0);
  c.end();
  c.get(j).i32(4).i32Add().set(j);
  c.br(0).end().end();
  return c;
}

/** `xtr(x, stride, mbytes, p4, z, g)`: g[j] += Σ_i x_j[i] · z[i], four columns a pass, each its own two-lane sum. */
function xtr(fused: boolean): Code {
  const c = new Code(6);
  const [X, stride, mbytes, p4, Z, G] = [0, 1, 2, 3, 4, 5];
  const j = c.local(I32);
  const i = c.local(I32);
  const g = c.local(I32);
  const col = [c.local(I32), c.local(I32), c.local(I32), c.local(I32)];
  const acc = [c.local(V128), c.local(V128), c.local(V128), c.local(V128)];
  const r = c.local(V128);
  c.i32(0).set(j);
  c.block().loop(); // for (j = 0; j < p4; j += 4)
  c.get(j).get(p4).i32GeU().brIf(1);
  c.get(X).get(j).get(stride).i32Mul().i32Add().set(col[0]!);
  for (let q = 1; q < 4; q++) c.get(col[q - 1]!).get(stride).i32Add().set(col[q]!);
  for (const a of acc) c.v128Zero().set(a);
  c.i32(0).set(i);
  c.loop(); //   do { … } while ((i += 16) < mbytes): two rows a pass
  c.get(Z).get(i).i32Add().v128Load().set(r);
  for (let q = 0; q < 4; q++) {
    // acc_q += x_q · r
    if (fused) c.get(col[q]!).get(i).i32Add().v128Load().get(r).get(acc[q]!).f64x2RelaxedMadd().set(acc[q]!);
    else c.get(acc[q]!).get(col[q]!).get(i).i32Add().v128Load().get(r).f64x2Mul().f64x2Add().set(acc[q]!);
  }
  c.get(i).i32(16).i32Add().tee(i).get(mbytes).i32LtU().brIf(0);
  c.end();
  // g[j + q] += lane 0 + lane 1
  c.get(G).get(j).i32(8).i32Mul().i32Add().set(g);
  for (let q = 0; q < 4; q++) {
    const a = acc[q]!;
    c.get(g).get(g).f64Load(q * 8).get(a).f64x2ExtractLane(0).get(a).f64x2ExtractLane(1).f64Add().f64Add().f64Store(q * 8);
  }
  c.get(j).i32(4).i32Add().set(j);
  c.br(0).end().end();
  return c;
}

/** The module: `xw` and `xtr`, on an imported memory. With `fused`, each multiply-add is `f64x2.relaxed_madd`. */
export function productsModule(fused: boolean): Uint8Array<ArrayBuffer> {
  return new ModuleBuilder()
    .memory(1)
    .func('xw', [I32, I32, I32, I32, I32, I32], [], xw(fused))
    .func('xtr', [I32, I32, I32, I32, I32, I32], [], xtr(fused))
    .encode();
}

interface ProductsExports {
  xw(x: number, stride: number, mbytes: number, p4: number, w: number, z: number): void;
  xtr(x: number, stride: number, mbytes: number, p4: number, z: number, g: number): void;
}

/** What the kernel reads of a matrix: smaltml's Matrix has these, column by column. */
interface MatrixLike {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;
}

type BinaryRows = (z: Float64Array, y: Int32Array, weights: ArrayLike<number> | undefined, at: number, m: number, loss: number) => number;
type MultinomialRows = (z: Float64Array, stride: number, K: number, y: Int32Array, weights: ArrayLike<number> | undefined, at: number, m: number, loss: number) => number;

/** One fit's products: X in the kernel's memory, then for K classes the weights, the block's scores and the sums. */
class Prepared {
  #room: Room<ProductsExports> | null;
  readonly #X: MatrixLike;
  readonly #p4: number;
  /** Rows per column in memory: X's, made even. */
  readonly #np: number;
  /** Classes the memory has room for. */
  #K = 0;
  #z = new Float64Array(0);

  constructor(module: WebAssembly.Module, X: MatrixLike) {
    this.#room = new Room(module);
    this.#X = X;
    this.#p4 = Math.ceil(X.cols / 4) * 4;
    this.#np = X.rows + (X.rows & 1);
    this.#make(1);
  }

  /** Room for K classes; a larger memory, with X copied again, where there wasn't. */
  #make(K: number): void {
    if (K <= this.#K) return;
    const { rows: n, cols: p, data } = this.#X;
    const np = this.#np;
    const room = this.#room!;
    const mem = room.reserve((this.#p4 * np + K * (2 * this.#p4 + BLOCK)) * 8);
    mem.fill(0); // padding rows and columns stay 0
    for (let j = 0; j < p; j++) mem.set(data.subarray(j * n, j * n + n), j * np);
    this.#K = K;
    this.#z = new Float64Array(K * BLOCK);
  }

  /** Where the weights, scores and sums start, in f64s. */
  #at(K: number): { w: number; z: number; g: number } {
    const w = this.#p4 * this.#np;
    return { w, z: w + K * this.#p4, g: w + K * this.#p4 + K * BLOCK };
  }

  binaryPart(y: Int32Array, intercept: boolean, x: Float64Array, grad: Float64Array, from: number, to: number, weights: Float64Array | undefined, rows: BinaryRows): number {
    return this.#part(y, 1, intercept, x, grad, from, to, weights, (z, at, m, loss) => rows(z, y, weights, at, m, loss));
  }

  multinomialPart(y: Int32Array, K: number, intercept: boolean, x: Float64Array, grad: Float64Array, from: number, to: number, weights: Float64Array | undefined, rows: MultinomialRows): number {
    return this.#part(y, K, intercept, x, grad, from, to, weights, (z, at, m, loss) => rows(z, BLOCK, K, y, weights, at, m, loss));
  }

  /** Both parts: x holds K rows of (w, then b with an intercept); grad gets K rows of (Xᵀr, then Σr). */
  #part(y: Int32Array, K: number, intercept: boolean, x: Float64Array, grad: Float64Array, from: number, to: number, weights: Float64Array | undefined, step: (z: Float64Array, at: number, m: number, loss: number) => number): number {
    if (!this.#room) throw new Error('logisticProducts: used after release()');
    this.#make(K);
    const room = this.#room;
    const mem = room.f64;
    const ex = room.exports;
    const p = this.#X.cols;
    const p4 = this.#p4;
    const np = this.#np;
    const width = p + (intercept ? 1 : 0);
    const at = this.#at(K);
    const z = this.#z;
    mem.fill(0, at.w, at.g + K * p4);
    for (let c = 0; c < K; c++) mem.set(x.subarray(c * width, c * width + p), at.w + c * p4);
    const sums = new Float64Array(K);
    let loss = 0;
    for (let r0 = from; r0 < to; r0 += BLOCK) {
      const m = Math.min(BLOCK, to - r0);
      const even = m + (m & 1);
      for (let c = 0; c < K; c++) {
        const zc = at.z + c * BLOCK;
        mem.fill(intercept ? x[c * width + p]! : 0, zc, zc + even);
        ex.xw(r0 * 8, np * 8, even * 8, p4, (at.w + c * p4) * 8, zc * 8);
        z.set(mem.subarray(zc, zc + m), c * BLOCK);
      }
      loss = step(z, r0, m, loss);
      for (let c = 0; c < K; c++) {
        const zc = at.z + c * BLOCK;
        mem.set(z.subarray(c * BLOCK, c * BLOCK + m), zc);
        if (even > m) mem[zc + m] = 0; // the next row's score, outside this part: no share of the sums
        let s = 0;
        for (let i = 0; i < m; i++) s += z[c * BLOCK + i]!;
        sums[c]! += s;
        ex.xtr(r0 * 8, np * 8, even * 8, p4, zc * 8, (at.g + c * p4) * 8);
      }
    }
    for (let c = 0; c < K; c++) {
      for (let j = 0; j < p; j++) grad[c * width + j] = mem[at.g + c * p4 + j]!;
      if (intercept) grad[c * width + p] = sums[c]!;
    }
    return loss;
  }

  release(): void {
    this.#room = null;
  }
}

/** The compiled products module: prepare() gives one fit's products over X. */
export class SimdProducts {
  readonly #module: WebAssembly.Module;

  constructor(module: WebAssembly.Module) {
    this.#module = module;
  }

  /** One fit's products over X, or null where X with room for a few classes won't fit in a module's memory. */
  prepare(X: MatrixLike): Prepared | null {
    const p4 = Math.ceil(X.cols / 4) * 4;
    const np = X.rows + (X.rows & 1);
    if ((p4 * np + 16 * (2 * p4 + BLOCK)) * 8 > MAX_BYTES || X.rows === 0 || X.cols === 0) return null;
    return new Prepared(this.#module, X);
  }
}
