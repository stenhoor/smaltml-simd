/**
 * gramPart on WebAssembly SIMD: (X − mean)ᵀ diag(weights) (X − mean) over a range of rows, the lower triangle filled,
 * as smaltml's own gramPart() gives it (smaltml ADR 0035, the probe). It works as smaltml's does: rows in blocks of 512,
 * each block's columns copied (centred, times √weight) into a buffer, here the WebAssembly memory, then a 2 × 4 tile
 * of the lower triangle at a time, eight sums kept in registers, over two rows at a time (f64x2).
 *
 * Columns are padded with zeros to a multiple of 4, and a block's rows to an even number, so the tiles need no
 * remainder loops. The sums run in another order than smaltml's (even rows and odd rows apart, then added), so results
 * agree in all but the last bits.
 */
import { Code, F64, I32, ModuleBuilder, Room, V128 } from 'smaltkit/simd';

/** Rows per block, as smaltml's: 512 rows of up to a few hundred columns stay within a CPU's second-level cache. */
export const BLOCK = 512;

/** What gramPart reads of a matrix: smaltml's Matrix has these, column by column. */
export interface MatrixLike {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;
}

/**
 * The module: one function, `gram(buf, stride, mbytes, pp, out)`, all byte addresses and sizes. `buf` holds pp
 * columns, each `stride` bytes apart, of which the first `mbytes` (a multiple of 16) are rows. It adds the lower
 * triangle of the columns' products, 2 × 4 entries at a time, into the pp × pp matrix at `out`, row by row. With
 * `fused`, each multiply-add is relaxed SIMD's `f64x2.relaxed_madd`.
 */
export function gramModule(fused: boolean): Uint8Array<ArrayBuffer> {
  const c = new Code(5);
  const [buf, stride, mbytes, pp, out] = [0, 1, 2, 3, 4];
  const j = c.local(I32);
  const k = c.local(I32);
  const i = c.local(I32);
  const cj0 = c.local(I32);
  const cj1 = c.local(I32);
  const ck = [c.local(I32), c.local(I32), c.local(I32), c.local(I32)];
  const oj0 = c.local(I32);
  const oj1 = c.local(I32);
  const x0 = c.local(V128);
  const x1 = c.local(V128);
  const y = [c.local(V128), c.local(V128), c.local(V128), c.local(V128)];
  // acc[r][q]: row j + r of the tile against column k + q.
  const acc = [0, 1].map(() => [c.local(V128), c.local(V128), c.local(V128), c.local(V128)]);

  /** v at address `base` + i. */
  const load = (base: number, into: number) => c.get(base).get(i).i32Add().v128Load().set(into);
  /** sum += x · y, lane by lane. */
  const madd = (sum: number, x: number, yv: number) =>
    fused ? c.get(x).get(yv).get(sum).f64x2RelaxedMadd().set(sum) : c.get(sum).get(x).get(yv).f64x2Mul().f64x2Add().set(sum);

  c.i32(0).set(j);
  c.block().loop(); // for (j = 0; j < pp; j += 2)
  c.get(j).get(pp).i32GeU().brIf(1);
  c.get(buf).get(j).get(stride).i32Mul().i32Add().set(cj0);
  c.get(cj0).get(stride).i32Add().set(cj1);
  c.i32(0).set(k);
  c.block().loop(); //   for (k = 0; k < j + 2; k += 4)
  c.get(k).get(j).i32(2).i32Add().i32GeU().brIf(1);
  c.get(buf).get(k).get(stride).i32Mul().i32Add().set(ck[0]!);
  for (let q = 1; q < 4; q++) c.get(ck[q - 1]!).get(stride).i32Add().set(ck[q]!);
  for (const row of acc) for (const a of row) c.v128Zero().set(a);
  c.i32(0).set(i);
  c.loop(); //     do { … } while ((i += 16) < mbytes): two rows a pass
  load(cj0, x0);
  load(cj1, x1);
  for (let q = 0; q < 4; q++) load(ck[q]!, y[q]!);
  for (let q = 0; q < 4; q++) {
    madd(acc[0]![q]!, x0, y[q]!);
    madd(acc[1]![q]!, x1, y[q]!);
  }
  c.get(i).i32(16).i32Add().tee(i).get(mbytes).i32LtU().brIf(0);
  c.end();
  //     out[(j + r) · pp + k + q] += lane 0 + lane 1
  c.get(out).get(j).get(pp).i32Mul().get(k).i32Add().i32(8).i32Mul().i32Add().set(oj0);
  c.get(oj0).get(pp).i32(8).i32Mul().i32Add().set(oj1);
  for (const [r, o] of [[0, oj0], [1, oj1]] as const) {
    for (let q = 0; q < 4; q++) {
      const a = acc[r]![q]!;
      c.get(o).get(o).f64Load(q * 8).get(a).f64x2ExtractLane(0).get(a).f64x2ExtractLane(1).f64Add().f64Add().f64Store(q * 8);
    }
  }
  c.get(k).i32(4).i32Add().set(k);
  c.br(0).end().end();
  c.get(j).i32(2).i32Add().set(j);
  c.br(0).end().end();

  return new ModuleBuilder().memory(1).func('gram', [I32, I32, I32, I32, I32], [], c).encode();
}

interface GramExports {
  gram(buf: number, stride: number, mbytes: number, pp: number, out: number): void;
}

/** One compiled gram module, its memory and the JavaScript that fills it: a gramPart() with smaltml's signature. */
export class SimdGram {
  readonly #room: Room<GramExports>;

  constructor(module: WebAssembly.Module) {
    this.#room = new Room(module);
  }

  #reserve(bytes: number): Float64Array {
    return this.#room.reserve(bytes);
  }

  /** smaltml's gramPart(), on SIMD: the p × p lower triangle (p = columns, + 1 with `ones`), row by row. */
  gramPart(X: MatrixLike, mean: ArrayLike<number> | undefined, from: number, to: number, weights?: ArrayLike<number>, ones = false): Float64Array {
    const n = X.rows;
    const cols = X.cols;
    const p = cols + (ones ? 1 : 0);
    const A = new Float64Array(p * p);
    if (p === 0 || to <= from) return A;
    const pp = Math.ceil(p / 4) * 4;
    const B = BLOCK;
    const outAt = pp * B; // in f64s: the buffer first, then the pp × pp sums
    const mem = this.#reserve((outAt + pp * pp) * 8);
    mem.fill(0, 0, outAt + pp * pp); // the padding columns and the sums start at 0
    const d = X.data;
    // √weight of each row of the block, once per row.
    const root = new Float64Array(weights ? B : 0);
    for (let r0 = from; r0 < to; r0 += B) {
      const m = Math.min(B, to - r0);
      const even = m + (m & 1);
      if (weights) for (let i = 0; i < m; i++) root[i] = Math.sqrt(weights[r0 + i]!);
      // Each row times √weight, so the plain sums of products are the weighted ones, as in smaltml's.
      for (let j = 0; j < cols; j++) {
        const off = j * n + r0;
        const mu = mean ? mean[j]! : 0;
        const bj = j * B;
        if (weights) for (let i = 0; i < m; i++) mem[bj + i] = (d[off + i]! - mu) * root[i]!;
        else for (let i = 0; i < m; i++) mem[bj + i] = d[off + i]! - mu;
        if (even > m) mem[bj + m] = 0;
      }
      if (ones) {
        const bj = cols * B;
        if (weights) mem.set(root.subarray(0, m), bj);
        else mem.fill(1, bj, bj + m);
        if (even > m) mem[bj + m] = 0;
      }
      this.#room.exports.gram(0, B * 8, even * 8, pp, outAt * 8);
    }
    for (let j = 0; j < p; j++) for (let k = 0; k <= j; k++) A[j * p + k] = mem[outAt + j * pp + k]!;
    return A;
  }
}
