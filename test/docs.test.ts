// Examples are tests (BRAND.md, Documentation, rule 5). Every ```ts example in docs/ runs as its playground runs it
// (docs/.vitepress/theme/simd.ts): after the page's examples above it, in one scope. The table printed under it is its
// tested result, row for row; a long one prints its first rows and `… N more rows`. An example marked
// `<!-- docs:error CODE -->` must fail with CODE. A fence marked `noplay` is setup only; one after `<!-- docs:skip -->`
// is not run. smaltml's own test of its docs (smaltml's test/docs-examples.test.ts), on node --test.
//
//   UPDATE_DOCS=1 npm test   writes the printed results into the pages.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { stopThreads, useKernels } from '@smaltworks/smaltml';
import { runExample, toTable } from '../docs/.vitepress/theme/simd.ts';

type SetupStep = string | { sql: string; fails: true };

const UPDATE = !!process.env.UPDATE_DOCS;
const LONG = 12;
const SHORT = 6;
const DOCS = new URL('../docs/', import.meta.url).pathname;

after(async () => {
  useKernels(null);
  await stopThreads();
});

function markdown(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      if (f.startsWith('.') || f === 'node_modules' || f === 'public') return [];
      return statSync(p).isDirectory() ? markdown(p) : p.endsWith('.md') ? [p] : [];
    });
}

interface Example {
  line: number;
  end: number;
  table: { from: number; to: number } | null;
  code: string;
  fails?: string;
  setup: SetupStep[];
}

function examples(file: string): Example[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out: Example[] = [];
  const setup: SetupStep[] = [];
  let markers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = /^<!--\s*(docs:[\s\S]*?)\s*-->\s*$/.exec(line.trim());
    if (marker) {
      markers.push(marker[1]!);
      continue;
    }
    const open = /^```(\S*)\s*(.*)$/.exec(line);
    if (!open) {
      if (line.trim()) markers = [];
      continue;
    }
    const start = i;
    for (i++; i < lines.length && lines[i] !== '```'; i++);
    const [lang, info] = [open[1]!, open[2]!];
    const kinds = markers.map((m) => m.split(/\s+/)[0]);
    const fails = markers.find((m) => m.startsWith('docs:error'))?.split(/\s+/)[1];
    markers = [];
    if (lang !== 'ts' || kinds.includes('docs:skip')) continue;
    // As the kit's playground does: a noplay fence doesn't run, but is setup for the examples below it.
    if (info.split(/\s+/).includes('noplay')) {
      setup.push(lines.slice(start + 1, i).join('\n').trim());
      continue;
    }
    const code = lines.slice(start + 1, i).join('\n');
    let j = i + 1;
    while (j < lines.length && !lines[j]!.trim()) j++;
    let table: Example['table'] = null;
    if (lines[j]?.startsWith('|')) {
      const from = j;
      while (j < lines.length && lines[j]!.startsWith('|')) j++;
      table = { from, to: j };
    }
    out.push({ line: start + 1, end: i, table, code, fails, setup: setup.slice() });
    setup.push(fails !== undefined ? { sql: code.trim(), fails: true } : code.trim());
  }
  return out;
}

/** A result as the Markdown table under its example. */
function render(t: { columns: string[]; rows: string[][]; note?: string }): string[] {
  if (t.note !== undefined) return [];
  const rows = t.rows.length > LONG ? t.rows.slice(0, SHORT) : t.rows;
  // Escaped for Markdown: | ends a cell, and VitePress reads {…} at a cell's end as attributes.
  const esc = (c: string) => c.replace(/[|{}]/g, '\\$&');
  const out = [`| ${t.columns.map(esc).join(' | ')} |`, `| ${t.columns.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)];
  if (t.rows.length > LONG) out.push(`| … ${t.rows.length - SHORT} more rows |${' |'.repeat(Math.max(0, t.columns.length - 1))}`);
  return out;
}

const updates = new Map<string, { at: Example; table: string[] }[]>();

for (const file of markdown(DOCS)) {
  const list = examples(file);
  if (list.length === 0) continue;
  describe(file.slice(DOCS.length), () => {
    for (const ex of list) {
      test(`line ${ex.line}`, async () => {
        // Each example starts from smaltml's own kernels, as a page does when it loads.
        useKernels(null);
        if (ex.fails !== undefined) {
          await assert.rejects(runExample(ex.code, ex.setup as never), { code: ex.fails });
          return;
        }
        const table = render(toTable(await runExample(ex.code, ex.setup as never)));
        const printed = ex.table ? readFileSync(file, 'utf8').split('\n').slice(ex.table.from, ex.table.to) : [];
        if (UPDATE) {
          const list = updates.get(file) ?? [];
          list.push({ at: ex, table });
          updates.set(file, list);
          return;
        }
        assert.deepEqual(printed.map((l) => l.trim()), table, `${file}:${ex.line}: run UPDATE_DOCS=1 npm test to rewrite`);
      });
    }
  });
}

if (UPDATE) {
  after(() => {
    for (const [file, list] of updates) {
      const lines = readFileSync(file, 'utf8').split('\n');
      // From the bottom up, so earlier line numbers stay right.
      for (const { at, table } of [...list].sort((a, b) => b.at.end - a.at.end)) {
        if (at.table) lines.splice(at.table.from, at.table.to - at.table.from, ...table);
        else if (table.length) lines.splice(at.end + 1, 0, '', ...table);
      }
      writeFileSync(file, lines.join('\n'));
    }
  });
}
