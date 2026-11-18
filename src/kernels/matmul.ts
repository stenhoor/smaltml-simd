/**
 * smaltml's matMul kernel on WebAssembly SIMD: A · B, A n × p and B p × k, both column by column, giving n × k column
 * by column (smaltml's ownMatMul, behind matMulSync and matMul on the CPU).
 *
 * A 4 × 4 tile of the output at a time: four rows (two f64x2) against four columns, sixteen sums in eight registers,
 * over every l of the inner size. Each step loads two pairs of A's column l and splats four of B's values. Rows are
 * padded with zeros to a multiple of 4 and columns of the output to a multiple of 4, so the tiles need no remainder
 * loops.
 *
 * Each sum adds its products in the order of l, from 0, as smaltml's own does, so plain SIMD gives smaltml's result
 * bit for bit (smaltml's skips a product whose B value is 0, which changes nothing unless A holds an infinity or NaN).
 * Fused multiply-add rounds once per step instead of twice.
 */
import { Code, I32, ModuleBuilder, Room, V128 } from 'smaltkit/simd';

/**
 * The module: one function, `matmul(a, b, out, n, p, k)`. `a` is n × p (n a multiple of 4), `b` is p × k (k a
 * multiple of 4), `out` is n × k, all column by column at those byte addresses; p is at least 1.
 */
export function matMulModule(fused: boolean): Uint8Array<ArrayBuffer> {
  const c = new Code(6);
  const [A, B, OUT, N, P, K] = [0, 1, 2, 3, 4, 5];
  const j = c.local(I32);
  const i = c.local(I32);
  const l = c.local(I32);
  const pa = c.local(I32);
  const colStride = c.local(I32); // n · 8: from one column of A, or of the output, to the next
  const pb = [c.local(I32), c.local(I32), c.local(I32), c.local(I32)]; // B's columns j to j + 3, at row 0
  const qb = [c.local(I32), c.local(I32), c.local(I32), c.local(I32)]; // the same, at row l
  const x = [c.local(V128), c.local(V128)];
  const y = [c.local(V128), c.local(V128), c.local(V128), c.local(V128)];
  // acc[r][q]: rows i + 2r and i + 2r + 1 against column j + q.
  const acc = [0, 1].map(() => [c.local(V128), c.local(V128), c.local(V128), c.local(V128)]);

  c.get(N).i32(8).i32Mul().set(colStride);
  c.i32(0).set(j);
  c.block().loop(); // for (j = 0; j < k; j += 4)
  c.get(j).get(K).i32GeU().brIf(1);
  c.get(B).get(j).get(P).i32Mul().i32(8).i32Mul().i32Add().set(pb[0]!);
  for (let q = 1; q < 4; q++) c.get(pb[q - 1]!).get(P).i32(8).i32Mul().i32Add().set(pb[q]!);
  c.i32(0).set(i);
  c.block().loop(); //   for (i = 0; i < n; i += 4)
  c.get(i).get(N).i32GeU().brIf(1);
  for (const row of acc) for (const a of row) c.v128Zero().set(a);
  c.get(A).get(i).i32(8).i32Mul().i32Add().set(pa);
  for (let q = 0; q < 4; q++) c.get(pb[q]!).set(qb[q]!);
  c.get(P).set(l);
  c.loop(); //     do { … } while (--l !== 0): one l a pass
  c.get(pa).v128Load(0).set(x[0]!);
  c.get(pa).v128Load(16).set(x[1]!);
  for (let q = 0; q < 4; q++) c.get(qb[q]!).f64Load().f64x2Splat().set(y[q]!);
  for (let r = 0; r < 2; r++) {
    for (let q = 0; q < 4; q++) {
      const a = acc[r]![q]!;
      if (fused) c.get(x[r]!).get(y[q]!).get(a).f64x2RelaxedMadd().set(a);
      else c.get(a).get(x[r]!).get(y[q]!).f64x2Mul().f64x2Add().set(a);
    }
  }
  c.get(pa).get(colStride).i32Add().set(pa);
  for (let q = 0; q < 4; q++) c.get(qb[q]!).i32(8).i32Add().set(qb[q]!);
  c.get(l).i32(1).i32Sub().tee(l).i32(0).i32Ne().brIf(0);
  c.end();
  //     out[(j + q) · n + i + 2r …] = acc[r][q]
  for (let q = 0; q < 4; q++) {
    for (let r = 0; r < 2; r++) {
      c.get(OUT).get(j).i32(q).i32Add().get(colStride).i32Mul().i32Add().get(i).i32(8).i32Mul().i32Add();
      c.get(acc[r]![q]!).v128Store(r * 16);
    }
  }
  c.get(i).i32(4).i32Add().set(i);
  c.br(0).end().end();
  c.get(j).i32(4).i32Add().set(j);
  c.br(0).end().end();

  return new ModuleBuilder().memory(1).func('matmul', [I32, I32, I32, I32, I32, I32], [], c).encode();
}

interface MatMulExports {
  matmul(a: number, b: number, out: number, n: number, p: number, k: number): void;
}

/** One compiled matmul module, its memory and the JavaScript that fills it: a matMul with smaltml's signature. */
export class SimdMatMul {
  readonly #room: Room<MatMulExports>;

  constructor(module: WebAssembly.Module) {
    this.#room = new Room(module);
  }

  #reserve(bytes: number): Float64Array {
    return this.#room.reserve(bytes);
  }

  /** smaltml's matMul kernel: A (n × p) · B (p × k), column by column, as an n × k Float64Array, column by column. */
  matMul(n: number, p: number, k: number, a: Float64Array, b: Float64Array): Float64Array {
    const out = new Float64Array(n * k);
    if (n === 0 || k === 0 || p === 0) return out;
    const nn = Math.ceil(n / 4) * 4;
    const kk = Math.ceil(k / 4) * 4;
    // In f64s: A (nn × p), then B (p × kk), then the output (nn × kk).
    const aAt = 0;
    const bAt = nn * p;
    const outAt = bAt + p * kk;
    const mem = this.#reserve((outAt + nn * kk) * 8);
    if (nn === n) mem.set(a, aAt);
    else {
      for (let l = 0; l < p; l++) {
        const at = aAt + l * nn;
        mem.set(a.subarray(l * n, (l + 1) * n), at);
        mem.fill(0, at + n, at + nn);
      }
    }
    mem.set(b, bAt);
    mem.fill(0, bAt + p * k, bAt + p * kk); // B's padding columns
    this.#room.exports.matmul(aAt * 8, bAt * 8, outAt * 8, nn, p, kk);
    if (nn === n) out.set(mem.subarray(outAt, outAt + n * k));
    else for (let j = 0; j < k; j++) out.set(mem.subarray(outAt + j * nn, outAt + j * nn + n), j * n);
    return out;
  }
}
