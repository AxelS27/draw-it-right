import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, createMatch, publicMatch, submit } from '../worker/src/engine.ts';
const players = { alice: { username: 'Alice', avatar: {} }, bob: { username: 'Bob', avatar: {} } };

test('shared deadlines, duplicate submissions and reward exactly once in final state', () => {
  let state = createMatch(players, ['alice', 'bob'], 1, 30, true, 1000);
  assert.equal(state.phase, 'reveal');
  state = advance(state, 3999); assert.equal(state.phase, 'reveal');
  state = advance(state, 4000); assert.equal(state.phase, 'drawing');
  assert.equal(submit(state, 'alice', state.deadline).accepted, false);
  const first = submit(state, 'alice', 5000);
  assert.equal(first.accepted, true);
  state = first.match;
  assert.equal(submit(state, 'alice', 5001).accepted, false);
  assert.equal(publicMatch(state).submitted, undefined);
  state = advance(state, state.deadline);
  assert.equal(state.phase, 'judging');
  state = advance(state, state.deadline);
  assert.equal(state.phase, 'results');
  assert.equal(state.results[0].entries.bob.points, 0);
  assert.equal(state.results[0].entries.alice.coins, 20);
  state = advance(state, state.deadline);
  assert.equal(state.phase, 'final');
  assert.equal(state.awards.alice, 170);
  assert.equal(state.awards.bob, 0);
  assert.equal(advance(state, 100000), state);
});

test('forty players complete seven server-timed rounds without exceeding room state size', () => {
  const crowd = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`u${i}`, { username: `Player${i}`, avatar: {} }]));
  let state = createMatch(crowd, Object.keys(crowd), 7, 30, true, 0);
  for (let round = 0; round < 7; round++) {
    state = advance(state, state.deadline);
    for (const uid of state.order) state = submit(state, uid, state.deadline - 2000).match;
    assert.equal(Object.keys(state.submitted).length, 40);
    state = advance(state, state.deadline);
    state = advance(state, state.deadline);
    state = advance(state, state.deadline);
  }
  assert.equal(state.phase, 'final');
  assert.equal(state.results.length, 7);
  assert.equal(Object.keys(state.awards).length, 40);
  assert.ok(JSON.stringify(state).length < 500_000);
});

test('rounds advance on the server and final results sum once', () => {
  let state = createMatch(players, ['alice', 'bob'], 2, 20, false, 0);
  for (let round = 1; round <= 2; round++) {
    state = advance(state, state.deadline);
    state = submit(state, 'alice', state.deadline - 1000).match;
    state = submit(state, 'bob', state.deadline - 2000).match;
    state = advance(state, state.deadline);
    state = advance(state, state.deadline);
    state = advance(state, state.deadline);
  }
  assert.equal(state.phase, 'final');
  assert.equal(state.results.length, 2);
  assert.equal(state.awards.alice + state.awards.bob, 2 * 2 * 20 + 150 + 100);
});
