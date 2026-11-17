import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probes, simdSupport } from '../src/support.ts';

test('Node has WebAssembly SIMD and relaxed SIMD', () => {
  assert.deepEqual(simdSupport(), { simd: true, relaxed: true });
});

test('the probes are well-formed modules that compile', async () => {
  for (const bytes of [probes.SIMD, probes.RELAXED]) {
    assert.ok((await WebAssembly.compile(bytes)) instanceof WebAssembly.Module);
  }
});

test('a module that isn\'t valid reads as unsupported', () => {
  const broken = probes.SIMD.slice(0, -1);
  assert.equal(WebAssembly.validate(broken), false);
});

test('without WebAssembly, nothing is supported', () => {
  const saved = globalThis.WebAssembly;
  try {
    // @ts-expect-error: removed for the test
    delete globalThis.WebAssembly;
    assert.deepEqual(simdSupport(), { simd: false, relaxed: false });
  } finally {
    globalThis.WebAssembly = saved;
  }
});
