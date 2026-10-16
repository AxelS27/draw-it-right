import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { advance, createMatch, finishJudging, PROMPTS, publicMatch, submit } from '../worker/src/engine.ts';
const players = { alice: { username: 'Alice', avatar: {} }, bob: { username: 'Bob', avatar: {} } };
const correct = { class: 'cat', confidence: .9, targetConfidence: .9 };

test('all live prompts exist in the model training label order', () => {
  const classes = JSON.parse(readFileSync(new URL('../model-service/class_names.json', import.meta.url), 'utf8'));
  for (const prompt of PROMPTS) assert.ok(classes.includes(prompt), `${prompt} must be recognized by the model`);
});

test('server waits for model results, rejects duplicate submissions and awards exactly once', () => {
  let state = createMatch(players, ['alice', 'bob'], 1, 30, true, 1000);
  state = advance(state, 4000);
  assert.equal(state.phase, 'drawing');
  assert.equal(submit(state, 'alice', state.deadline).accepted, false);
  state = submit(state, 'alice', 5000).match;
  assert.equal(submit(state, 'alice', 5001).accepted, false);
  assert.equal(publicMatch(state).submitted, undefined);
  assert.equal(publicMatch(state).judgingMode, 'model');
  state = advance(state, state.deadline);
  assert.equal(state.phase, 'judging');
  assert.equal(advance(state, state.deadline + 100000), state, 'never publishes simulated scores on a deadline');
  state = finishJudging(state, { alice: correct }, state.deadline);
  assert.equal(state.phase, 'results');
  assert.equal(state.results[0].entries.bob.points, 0);
  assert.equal(state.results[0].entries.alice.prediction, 'cat');
  assert.equal(state.results[0].entries.alice.coins, 20);
  assert.equal(state.results[0].entries.alice.confidence, .9);
  state = advance(state, state.deadline);
  state = advance(state, state.deadline);
  assert.equal(state.phase, 'final');
  assert.equal(state.awards.alice, 170);
  assert.equal(state.awards.bob, 0);
  assert.equal(advance(state, 100000), state);
});

test('forty players complete seven judged rounds without exceeding room state size', () => {
  const crowd = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`u${i}`, { username: `Player${i}`, avatar: {} }]));
  let state = createMatch(crowd, Object.keys(crowd), 7, 30, true, 0);
  for (let round = 0; round < 7; round++) {
    state = advance(state, state.deadline);
    for (const uid of state.order) state = submit(state, uid, state.deadline - 2000).match;
    state = advance(state, state.deadline);
    const scores = Object.fromEntries(state.order.map(uid => [uid, { class: state.prompt, confidence: .85, targetConfidence: .85 }]));
    state = finishJudging(state, scores, state.deadline);
    state = advance(state, state.deadline);
    state = advance(state, state.deadline);
  }
  assert.equal(state.phase, 'final');
  assert.equal(state.results.length, 7);
  assert.equal(Object.keys(state.awards).length, 40);
  assert.ok(JSON.stringify(state).length < 500_000);
});

test('wrong guesses, blanks, previous correct streak and double points', () => {
  let state = createMatch(players, ['alice', 'bob'], 2, 20, true, 0);
  for (let round = 1; round <= 2; round++) {
    state = advance(state, state.deadline);
    state = submit(state, 'alice', state.deadline - 1000).match;
    state = submit(state, 'bob', state.deadline - 2000).match;
    state = advance(state, state.deadline);
    state = finishJudging(state, { alice: { class: state.prompt, confidence: .9, targetConfidence: .9 }, bob: null }, state.deadline);
    assert.equal(state.results.at(-1).entries.bob.points, 0);
    state = advance(state, state.deadline);
    state = advance(state, state.deadline);
  }
  assert.equal(state.phase, 'final');
  assert.ok(state.results[1].entries.alice.points > 2 * state.results[0].entries.alice.points);
  assert.equal(state.awards.alice + state.awards.bob, 2 * 20 + 150 + 100);
});
