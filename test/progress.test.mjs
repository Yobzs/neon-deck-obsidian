// Progress helpers: pure functions used by the Progress widget and its backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const P = load('neon-tasks', ['snapPct', 'progressLine']);

test('snapPct rounds to 5% and clamps', () => {
  assert.equal(P.snapPct(47), 45);
  assert.equal(P.snapPct(48), 50);
  assert.equal(P.snapPct(-3), 0);
  assert.equal(P.snapPct(999), 100);
  assert.equal(P.snapPct('x'), 0);
});

test('progressLine with and without due date', () => {
  assert.equal(P.progressLine({ text: 'A', pct: 40, due: '2026-12-01' }), '- A — 40% · due 2026-12-01');
  assert.equal(P.progressLine({ text: 'A', pct: 40 }), '- A — 40%');
});
