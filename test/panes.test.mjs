// Dashboard pane filters: which tickets the reminder check and the "Needs attention" pane pick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { needsAttention } = load('neon-tickets', ['needsAttention']);
const plain = (v) => JSON.parse(JSON.stringify(v)); // arrays from the module's sandbox have another prototype
const now = { isAfter: () => false };

test('needs attention picks follow-ups, near due dates and reminders that came up', () => {
  const pick = (t, ahead = 1) => plain(needsAttention([t], now, ahead)).length;
  assert.equal(pick({ bucket: 'followup' }), 1);
  assert.equal(pick({ due: true, daysLeft: 0 }, 1), 1);
  assert.equal(pick({ due: true, daysLeft: 5 }, 1), 0);
  assert.equal(pick({ remind: { isAfter: () => false } }), 1);
  assert.equal(pick({ remind: { isAfter: () => true } }), 0);
  assert.equal(pick({}), 0);
});
