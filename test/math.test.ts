// The f64x2 math functions (src/wasm/math.ts) against JavaScript's Math, over their whole domains and their edges: the
// worst difference, in units in the last place (ulps) of the result as Math gives it. Measured over a million random
// inputs per range (2026-11-17): exp within 1 ulp, log1p and ln within 3; Math's own rounding is part of that.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Code } from '../src/wasm/code.ts';
import { I32, V128 } from '../src/wasm/encode.ts';
import { exp, log1p, logAtLeast1 } from '../src/wasm/math.ts';
import { ModuleBuilder } from '../src/wasm/module.ts';

type Emit = (c: Code, x: number, out: number) => void;

/** A module whose `f(count)` applies the function to `count` (even) f64 at address 0, in place. */
function apply(emit: Emit): (xs: Float64Array) => Float64Array {
  const c = new Code(1);
  const at = c.local(I32);
  const x = c.local(V128);
  const out = c.local(V128);
  c.i32(0).set(at);
  c.block().loop();
  c.get(at).get(0).i32(8).i32Mul().i32GeU().brIf(1);
  c.get(at).v128Load().set(x);
  emit(c, x, out);
  c.get(at).get(out).v128Store();
  c.get(at).i32(16).i32Add().set(at);
  c.br(0).end().end();
  const mod = new ModuleBuilder().memory(1).func('f', [I32], [], c).encode();
  assert.ok(WebAssembly.validate(mod));
  const compiled = new WebAssembly.Module(mod);
  // The module imports its memory: a new, larger one where more is needed, as the kernels do (src/kernels/room.ts).
  let memory = new WebAssembly.Memory({ initial: 1 });
  let ex = new WebAssembly.Instance(compiled, { env: { memory } }).exports as { f(count: number): void };
  return (xs) => {
    const n = xs.length + (xs.length & 1);
    const need = n * 8;
    if (memory.buffer.byteLength < need) {
      memory = new WebAssembly.Memory({ initial: Math.ceil(need / 65536) });
      ex = new WebAssembly.Instance(compiled, { env: { memory } }).exports as { f(count: number): void };
    }
    const mem = new Float64Array(memory.buffer, 0, n);
    mem.fill(0);
    mem.set(xs);
    ex.f(n);
    return mem.slice(0, xs.length);
  };
}

/** The size of one ulp at v. */
function ulp(v: number): number {
  const a = Math.abs(v);
  if (a === 0) return Number.MIN_VALUE;
  return Math.max(2 ** (Math.floor(Math.log2(a)) - 52), Number.MIN_VALUE);
}

function worstUlps(got: Float64Array, want: (x: number) => number, xs: Float64Array): { ulps: number; at: number } {
  let worst = { ulps: 0, at: NaN };
  for (let i = 0; i < xs.length; i++) {
    const w = want(xs[i]!);
    const u = Math.abs(got[i]! - w) / ulp(w);
    if (!(u <= worst.ulps)) worst = { ulps: u, at: xs[i]! };
  }
  return worst;
}

function grid(from: number, to: number, n: number): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

test('exp(x), x ≤ 0: within 2 ulps of Math.exp down to −708, then 0', () => {
  const f = apply(exp);
  const xs = Float64Array.from([...grid(-708, 0, 200_001), ...grid(-1, 0, 100_001), ...grid(-1e-12, 0, 1001), -0, -5e-324, -0.34657359027997264, -0.6931471805599453]);
  const w = worstUlps(f(xs), Math.exp, xs);
  assert.ok(w.ulps <= 2, `worst ${w.ulps} ulps at ${w.at}`);
  assert.deepEqual(Array.from(f(Float64Array.from([-708.5, -800, -Infinity]))), [0, 0, 0]);
  assert.equal(f(Float64Array.from([0]))[0], 1);
});

test('log1p(u), 0 ≤ u ≤ 1: within 3 ulps of Math.log1p', () => {
  const f = apply(log1p);
  const xs = Float64Array.from([...grid(0, 1, 200_001), ...grid(0, 1e-8, 10_001), 5e-324, 1e-300, 1]);
  const w = worstUlps(f(xs), Math.log1p, xs);
  assert.ok(w.ulps <= 3, `worst ${w.ulps} ulps at ${w.at}`);
  assert.equal(f(Float64Array.from([0]))[0], 0);
});

test('ln x, x ≥ 1: within 3 ulps of Math.log', () => {
  const f = apply(logAtLeast1);
  const xs = Float64Array.from([...grid(1, 2, 100_001), ...grid(1, 1000, 100_001), 1 + 2 ** -52, 2 - 2 ** -52, 2, 4, 1e10, 1e300]);
  const w = worstUlps(f(xs), Math.log, xs);
  assert.ok(w.ulps <= 3, `worst ${w.ulps} ulps at ${w.at}`);
  assert.equal(f(Float64Array.from([1]))[0], 0);
});
