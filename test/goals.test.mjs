// Goal helpers: pure functions used by the Goals tab, the Progress migration and the backup note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const G = load('neon-tasks', ['dayShift', 'goalStreak', 'fromProgress', 'goalLine']);
const log = (...d) => d.map((x) => ({ d: x, note: '' }));

test('dayShift crosses months and years', () => {
  assert.equal(G.dayShift('2026-03-01', -1), '2026-02-28');
  assert.equal(G.dayShift('2026-12-31', 1), '2027-01-01');
});

test('goalStreak counts days in a row up to today or yesterday', () => {
  assert.equal(G.goalStreak([], '2026-11-24'), 0);
  assert.equal(G.goalStreak(log('2026-11-24'), '2026-11-24'), 1);
  assert.equal(G.goalStreak(log('2026-11-22', '2026-11-23'), '2026-11-24'), 2); // today not yet checked in
  assert.equal(G.goalStreak(log('2026-11-20', '2026-11-22', '2026-11-23', '2026-11-24'), '2026-11-24'), 3); // gap on the 21st
  assert.equal(G.goalStreak(log('2026-11-21'), '2026-11-24'), 0);
});

test('fromProgress keeps text, due and created; percent becomes a check-in', () => {
  const a = G.fromProgress({ id: 'x', text: 'Read', pct: 0, due: '2026-12-01', created: 5 }, '2026-11-24', 99);
  assert.deepEqual({ ...a, log: [...a.log] }, { id: 'x', text: 'Read', due: '2026-12-01', created: 5, done: null, log: [] });
  const b = G.fromProgress({ id: 'y', text: 'Run', pct: 40 }, '2026-11-24', 99);
  assert.equal(b.done, null);
  assert.equal(b.log[0].note, '40% (from Progress)');
  assert.equal(b.log[0].d, '2026-11-24');
  assert.equal(G.fromProgress({ id: 'z', text: 'Ship', pct: 100 }, '2026-11-24', 99).done, 99);
});

test('goalLine', () => {
  assert.equal(G.goalLine({ text: 'A', due: '', log: [], done: null }), '- A');
  assert.equal(G.goalLine({ text: 'A', due: '2026-12-01', log: log('2026-11-20', '2026-11-22'), done: 7 }), '- A · due 2026-12-01 · last check-in 2026-11-22 · done');
});
