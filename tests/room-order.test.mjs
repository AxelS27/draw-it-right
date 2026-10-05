import assert from 'node:assert/strict';
import test from 'node:test';
import { nextHost, remainingJoinOrder } from '../src/room-order.ts';

test('host departure hands over to the earliest remaining joiner', () => {
  assert.equal(nextHost(['host', 'first', 'second'], 'host'), 'first');
  assert.deepEqual(remainingJoinOrder(['host', 'first', 'second'], 'host'), ['first', 'second']);
});

test('a manual host transfer keeps chronological join order for the next departure', () => {
  const order = ['original', 'first', 'new-host'];
  assert.equal(nextHost(order, 'new-host'), 'original');
  assert.equal(nextHost(order, 'original'), 'first');
  assert.equal(nextHost(['only-host'], 'only-host'), null);
});
