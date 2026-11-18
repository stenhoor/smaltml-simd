// The plugin's kernels and their memory. The WebAssembly writer they use (smaltkit/simd) is tested in smaltkit.
import assert from 'node:assert/strict';
import { test } from 'node:test';

test("the kernels never grow their memory: a larger call gets a new memory, and no buffer is detached", async () => {
  // Growing a WebAssembly memory detaches its old buffer, and V8 then slows every typed-array loop in the process.
  const { default: kernelSet } = await import('../src/kernels.ts');
  const set = await kernelSet({});
  const grow = WebAssembly.Memory.prototype.grow;
  let grew = 0;
  WebAssembly.Memory.prototype.grow = function (pages: number) {
    grew++;
    return grow.call(this, pages);
  };
  try {
    // XᵀX and a product far bigger than one 64 KiB page.
    const n = 3000;
    const p = 40;
    const X = { rows: n, cols: p, data: Float64Array.from({ length: n * p }, (_, i) => Math.sin(i)) };
    set.kernels.gramPart!(X as never, undefined, 0, n);
    set.kernels.matMul!(n, p, 3, X.data, Float64Array.from({ length: p * 3 }, (_, i) => i));
  } finally {
    WebAssembly.Memory.prototype.grow = grow;
  }
  assert.equal(grew, 0);
});
