/**
 * The logistic objectives' row steps on WebAssembly SIMD (smaltml's binaryLogisticRows and multinomialLogisticRows):
 * for a block of rows' scores z, the loss they add, and z replaced by the residuals the gradient needs. smaltml's own
 * calls Math.exp, Math.log1p and Math.log once or more per row; these run two rows at a time with the plugin's own
 * f64x2 exp, log1p and log (src/wasm/math.ts), within a few rounding steps of them.
 *
 * Binary, per row, with weight w and label y ∈ {0, 1}, and e = exp(−|z|):
 *   loss += w · (max(z, 0) + ln(1 + e) − y·z)            (−log p(y), as smaltml's log1pExp gives it)
 *   z     = w · (σ(z) − y), σ(z) = 1/(1 + e) for z ≥ 0, e/(1 + e) below
 * Multinomial, per row, over K classes:
 *   loss += w · (max + ln Σ e_c − z_y), e_c = exp(z_c − max)
 *   z_c   = w · (e_c / Σ e − [c = y])
 */
import { Room } from './room.ts';
import { Code } from '../wasm/code.ts';
import { F64, I32, V128 } from '../wasm/encode.ts';
import { exp, log1p, logAtLeast1 } from '../wasm/math.ts';
import { ModuleBuilder } from '../wasm/module.ts';

/** `binary(z, y, w, mbytes) → loss`: z, y and w are f64 arrays at those addresses, mbytes / 8 rows (an even number). */
function binary(fused: boolean): Code {
  const c = new Code(4);
  const [Z, Y, W, MB] = [0, 1, 2, 3];
  const i = c.local(I32);
  const z = c.local(V128);
  const y = c.local(V128);
  const w = c.local(V128);
  const negAbs = c.local(V128);
  const e = c.local(V128);
  const l1 = c.local(V128);
  const den = c.local(V128);
  const sig = c.local(V128);
  const loss = c.local(V128);
  c.v128Zero().set(loss);
  c.i32(0).set(i);
  c.loop(); // do { … } while ((i += 16) < mbytes): two rows a pass
  c.get(Z).get(i).i32Add().v128Load().set(z);
  c.get(Y).get(i).i32Add().v128Load().set(y);
  c.get(W).get(i).i32Add().v128Load().set(w);
  c.get(z).f64x2Abs().f64x2Neg().set(negAbs);
  exp(c, negAbs, e);
  log1p(c, e, l1);
  // loss += w · (max(z, 0) + l1 − y·z)
  if (fused) {
    // max(z, 0) + l1 − y·z = (−y)·z + (max(z, 0) + l1), fused
    c.get(w).get(y).f64x2Neg().get(z).get(z).v128Zero().f64x2Max().get(l1).f64x2Add().f64x2RelaxedMadd().get(loss).f64x2RelaxedMadd().set(loss);
  } else {
    c.get(loss).get(w).get(z).v128Zero().f64x2Max().get(l1).f64x2Add().get(y).get(z).f64x2Mul().f64x2Sub().f64x2Mul().f64x2Add().set(loss);
  }
  // σ(z): 1/(1 + e) where z ≥ 0, e/(1 + e) where z < 0
  c.get(e).f64x2Const(1).f64x2Add().set(den);
  c.f64x2Const(1).get(e).get(z).v128Zero().f64x2Ge().v128Bitselect().get(den).f64x2Div().set(sig);
  // z = w · (σ − y)
  c.get(Z).get(i).i32Add().get(w).get(sig).get(y).f64x2Sub().f64x2Mul().v128Store();
  c.get(i).i32(16).i32Add().tee(i).get(MB).i32LtU().brIf(0);
  c.end();
  c.get(loss).f64x2ExtractLane(0).get(loss).f64x2ExtractLane(1).f64Add();
  return c;
}

/**
 * `softmax(z, k, y, w, mbytes) → loss`: z holds k classes' scores, class by class, each mbytes long (mbytes / 8 rows,
 * an even number); y holds each row's class as an f64, w its weight.
 */
function softmax(): Code {
  const c = new Code(5);
  const [Z, K, Y, W, MB] = [0, 1, 2, 3, 4];
  const i = c.local(I32);
  const k = c.local(I32);
  const at = c.local(I32); // z_c's address for rows i, i + 1
  const y = c.local(V128);
  const w = c.local(V128);
  const zc = c.local(V128);
  const cls = c.local(V128); // c, in both lanes, to compare with y
  const max = c.local(V128);
  const zy = c.local(V128);
  const ec = c.local(V128);
  const sum = c.local(V128);
  const lnSum = c.local(V128);
  const inv = c.local(V128);
  const loss = c.local(V128);
  /** for (c = 0, at = z + i; c < k; c++, at += mbytes) { body } */
  const classes = (body: () => void) => {
    c.get(Z).get(i).i32Add().set(at);
    c.v128Zero().set(cls);
    c.get(K).set(k);
    c.loop();
    body();
    c.get(at).get(MB).i32Add().set(at);
    c.get(cls).f64x2Const(1).f64x2Add().set(cls);
    c.get(k).i32(1).i32Sub().tee(k).i32(0).i32Ne().brIf(0);
    c.end();
  };
  c.v128Zero().set(loss);
  c.i32(0).set(i);
  c.loop(); // do { … } while ((i += 16) < mbytes): two rows a pass
  c.get(Y).get(i).i32Add().v128Load().set(y);
  c.get(W).get(i).i32Add().v128Load().set(w);
  // The largest score, and the score of the row's own class.
  c.f64x2Const(-Infinity).set(max);
  c.v128Zero().set(zy);
  classes(() => {
    c.get(at).v128Load().set(zc);
    c.get(max).get(zc).f64x2Max().set(max);
    c.get(zy).get(zc).v128Zero().get(cls).get(y).f64x2Eq().v128Bitselect().f64x2Add().set(zy);
  });
  // e_c = exp(z_c − max), kept in place of z_c, and their sum.
  c.v128Zero().set(sum);
  classes(() => {
    c.get(at).v128Load().get(max).f64x2Sub().set(zc);
    exp(c, zc, ec);
    c.get(at).get(ec).v128Store();
    c.get(sum).get(ec).f64x2Add().set(sum);
  });
  // loss += w · (max + ln Σe − z_y)
  logAtLeast1(c, sum, lnSum);
  c.get(loss).get(w).get(max).get(lnSum).f64x2Add().get(zy).f64x2Sub().f64x2Mul().f64x2Add().set(loss);
  // z_c = w · (e_c / Σe − [c = y])
  c.f64x2Const(1).get(sum).f64x2Div().set(inv);
  classes(() => {
    c.get(at).get(w).get(at).v128Load().get(inv).f64x2Mul().get(cls).get(y).f64x2Eq().f64x2Const(1).v128And().f64x2Sub().f64x2Mul().v128Store();
  });
  c.get(i).i32(16).i32Add().tee(i).get(MB).i32LtU().brIf(0);
  c.end();
  c.get(loss).f64x2ExtractLane(0).get(loss).f64x2ExtractLane(1).f64Add();
  return c;
}

/** The module: `binary` and `softmax`, and its memory. With `fused`, the binary loss uses fused multiply-adds. */
export function logisticModule(fused: boolean): Uint8Array<ArrayBuffer> {
  return new ModuleBuilder()
    .memory(1)
    .func('binary', [I32, I32, I32, I32], [F64], binary(fused))
    .func('softmax', [I32, I32, I32, I32, I32], [F64], softmax())
    .encode();
}

interface LogisticExports {
  binary(z: number, y: number, w: number, mbytes: number): number;
  softmax(z: number, k: number, y: number, w: number, mbytes: number): number;
}

/** One compiled logistic module and the JavaScript that feeds it: smaltml's two logistic row kernels. */
export class SimdLogistic {
  readonly #room: Room<LogisticExports>;

  constructor(module: WebAssembly.Module) {
    this.#room = new Room(module);
  }

  #reserve(values: number): Float64Array {
    return this.#room.reserve(values * 8);
  }

  /** y and w for rows at … at + m, as f64, padded to `even` rows with weight 0, at `yAt` and `wAt`. */
  #labels(mem: Float64Array, y: Int32Array, weights: ArrayLike<number> | undefined, at: number, m: number, even: number, yAt: number, wAt: number): void {
    for (let i = 0; i < m; i++) mem[yAt + i] = y[at + i]!;
    if (weights) for (let i = 0; i < m; i++) mem[wAt + i] = weights[at + i]!;
    else mem.fill(1, wAt, wAt + m);
    mem.fill(0, yAt + m, yAt + even);
    mem.fill(0, wAt + m, wAt + even);
  }

  /** smaltml's binaryLogisticRows: rows at … at + m − 1, scores z[0 … m − 1] replaced by residuals; returns the loss. */
  binaryRows(z: Float64Array, y: Int32Array, weights: ArrayLike<number> | undefined, at: number, m: number): number {
    if (m <= 0) return 0;
    const even = m + (m & 1);
    const mem = this.#reserve(3 * even);
    mem.set(z.subarray(0, m), 0);
    mem[m] = 0;
    this.#labels(mem, y, weights, at, m, even, even, 2 * even);
    const loss = this.#room.exports.binary(0, even * 8, 2 * even * 8, even * 8);
    z.set(this.#room.f64.subarray(0, m));
    return loss;
  }

  /**
   * smaltml's multinomialLogisticRows: K classes' scores z[c · stride + i] for rows at … at + m − 1, replaced by
   * residuals; returns the loss.
   */
  multinomialRows(z: Float64Array, stride: number, K: number, y: Int32Array, weights: ArrayLike<number> | undefined, at: number, m: number): number {
    if (m <= 0 || K <= 0) return 0;
    const even = m + (m & 1);
    const mem = this.#reserve((K + 2) * even);
    for (let c = 0; c < K; c++) {
      mem.set(z.subarray(c * stride, c * stride + m), c * even);
      if (even > m) mem[c * even + m] = 0;
    }
    this.#labels(mem, y, weights, at, m, even, K * even, (K + 1) * even);
    const loss = this.#room.exports.softmax(0, K, K * even * 8, (K + 1) * even * 8, even * 8);
    const out = this.#room.f64;
    for (let c = 0; c < K; c++) z.set(out.subarray(c * even, c * even + m), c * stride);
    return loss;
  }
}
