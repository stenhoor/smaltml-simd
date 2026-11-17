import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Code } from '../src/wasm/code.ts';
import { F64, I32, s32, section, u32, V128 } from '../src/wasm/encode.ts';
import { ModuleBuilder } from '../src/wasm/module.ts';

test('LEB128, as the specification\'s examples give it', () => {
  assert.deepEqual(u32(0), [0x00]);
  assert.deepEqual(u32(127), [0x7f]);
  assert.deepEqual(u32(128), [0x80, 0x01]);
  assert.deepEqual(u32(624485), [0xe5, 0x8e, 0x26]);
  assert.deepEqual(u32(0xffffffff), [0xff, 0xff, 0xff, 0xff, 0x0f]);
  assert.deepEqual(s32(0), [0x00]);
  assert.deepEqual(s32(63), [0x3f]);
  assert.deepEqual(s32(64), [0xc0, 0x00]);
  assert.deepEqual(s32(-1), [0x7f]);
  assert.deepEqual(s32(-64), [0x40]);
  assert.deepEqual(s32(-65), [0xbf, 0x7f]);
  assert.deepEqual(s32(-123456), [0xc0, 0xbb, 0x78]);
  assert.throws(() => u32(-1), RangeError);
  assert.throws(() => s32(2 ** 31), RangeError);
  assert.deepEqual(section(1, [1, 2, 3]), [1, 3, 1, 2, 3]);
});

test('a module built here runs: f64x2 arithmetic through memory', async () => {
  // dot(a, b) for two pairs of f64 at addresses a and b: lane 0 + lane 1 of a · b, fused or not.
  for (const fused of [false, true]) {
    const c = new Code(2);
    const acc = c.local(V128);
    c.v128Zero().set(acc);
    if (fused) c.get(0).v128Load().get(1).v128Load().get(acc).f64x2RelaxedMadd().set(acc);
    else c.get(acc).get(0).v128Load().get(1).v128Load().f64x2Mul().f64x2Add().set(acc);
    c.get(acc).f64x2ExtractLane(0).get(acc).f64x2ExtractLane(1).f64Add();
    const bytes = new ModuleBuilder().memory(1).func('dot', [I32, I32], [F64], c).encode();
    assert.ok(WebAssembly.validate(bytes));
    const { instance } = (await WebAssembly.instantiate(bytes)) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
    const ex = instance.exports as { memory: WebAssembly.Memory; dot(a: number, b: number): number };
    new Float64Array(ex.memory.buffer).set([1.5, -2, 4, 0.25]);
    assert.equal(ex.dot(0, 16), 1.5 * 4 + -2 * 0.25);
  }
});

test('loops and branches: a sum of 1 to n', async () => {
  const c = new Code(1);
  const i = c.local(I32);
  const s = c.local(I32);
  c.i32(0).set(s).i32(1).set(i);
  c.block().loop();
  c.get(i).get(0).i32GeU().brIf(1); // stop once i ≥ n + 1
  c.get(s).get(i).i32Add().set(s);
  c.get(i).i32(1).i32Add().set(i);
  c.br(0).end().end();
  c.get(s);
  const bytes = new ModuleBuilder().func('sum', [I32], [I32], c).encode();
  const { instance } = (await WebAssembly.instantiate(bytes)) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
  assert.equal((instance.exports as { sum(n: number): number }).sum(101), 5050);
});
