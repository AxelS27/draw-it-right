import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewResult, getStandings, initialMatch, matchReducer, previewPrompts } from '../src/preview-match.ts';

const entrants = Array.from({ length: 40 }, (_, id) => ({ id, isYou: id === 0, profile: { username: `Player${id}`, avatar: { base: 'bean', color: 'mint', face: 'smile', accessory: 'none' } } }));
const result = (round = 1, double = false) => createPreviewResult(entrants, round, previewPrompts[round - 1], 'data:image/png;base64,own-drawing', double);

test('gallery retains the actual drawing, includes 40 players, and sorts sample points', () => {
  const round = result();
  assert.equal(round.drawings.length, 40);
  assert.equal(new Set(round.drawings.map(item => item.entrant.id)).size, 40);
  assert.equal(round.drawings.find(item => item.entrant.isYou).image, 'data:image/png;base64,own-drawing');
  assert(round.drawings.every((item, index, all) => index === 0 || all[index - 1].points >= item.points));
  assert(round.drawings.every(item => item.points >= 0 && item.points <= 2000));
});

test('cumulative scores include every round and apply double points exactly once', () => {
  const rounds = [result(1), result(2), result(3, true)];
  const single = result(3);
  for (const drawing of rounds[2].drawings) assert.equal(drawing.points, 2 * single.drawings.find(item => item.entrant.id === drawing.entrant.id).points);
  const standings = getStandings(entrants, rounds);
  for (const row of standings) {
    assert.equal(row.total, rounds.reduce((sum, round) => sum + round.drawings.find(item => item.entrant.id === row.entrant.id).points, 0));
    assert.equal(row.added, rounds[2].drawings.find(item => item.entrant.id === row.entrant.id).points);
  }
  assert(standings.every((item, index, all) => index === 0 || all[index - 1].total >= item.total));
});

test('manual submit waits; duplicate submit and out-of-order events cannot add scores', () => {
  const submitted = matchReducer(initialMatch, { type: 'submit', result: result(), wait: true });
  assert.equal(submitted.phase, 'waiting');
  assert.strictEqual(matchReducer(submitted, { type: 'submit', result: result(), wait: true }), submitted);
  assert.strictEqual(matchReducer(initialMatch, { type: 'results' }), initialMatch);
  assert.strictEqual(matchReducer(initialMatch, { type: 'submit', result: result(2), wait: false }), initialMatch);
  const judging = matchReducer(submitted, { type: 'judging' });
  assert.equal(judging.phase, 'judging');
  assert.strictEqual(matchReducer(judging, { type: 'leaderboard' }), judging);
  const showcase = matchReducer(judging, { type: 'results' });
  assert.equal(showcase.phase, 'results');
  assert.strictEqual(matchReducer(showcase, { type: 'next', totalRounds: 3 }), showcase);
  const leaderboard = matchReducer(showcase, { type: 'leaderboard' });
  assert.equal(leaderboard.phase, 'leaderboard');
  assert.strictEqual(matchReducer(leaderboard, { type: 'results' }), leaderboard);
});

test('full match ends at final podium, changes prompts, and rematch resets all scores', () => {
  let state = initialMatch;
  for (let round = 1; round <= 3; round++) {
    assert.equal(state.round, round);
    state = matchReducer(state, { type: 'submit', result: result(round, round === 3), wait: false });
    assert.equal(state.phase, 'judging');
    state = matchReducer(state, { type: 'results' });
    assert.equal(state.phase, 'results');
    if (round < 3) {
      state = matchReducer(state, { type: 'leaderboard' });
      assert.equal(state.phase, 'leaderboard');
    }
    const next = matchReducer(state, { type: 'next', totalRounds: 3 });
    assert.strictEqual(matchReducer(next, { type: 'next', totalRounds: 3 }), next);
    state = next;
  }
  assert.equal(state.phase, 'final');
  assert.equal(state.round, 3);
  assert.equal(state.results.length, 3);
  assert.equal(new Set(state.results.map(item => item.prompt)).size, 3);
  assert.deepEqual(matchReducer(state, { type: 'restart' }), initialMatch);
});

test('last showcase goes directly to podium without changing cumulative scores', () => {
  for (const totalRounds of [1, 3, 5, 7]) {
    const results = Array.from({ length: totalRounds }, (_, index) => result(index + 1, index + 1 === totalRounds));
    const showcase = { phase: 'results', round: totalRounds, results };
    const final = matchReducer(showcase, { type: 'next', totalRounds });
    assert.equal(final.phase, 'final');
    assert.equal(final.round, totalRounds);
    assert.strictEqual(final.results, results);
    assert.strictEqual(matchReducer(final, { type: 'next', totalRounds }), final);
  }
});

test('solo preview works and tied totals use a deterministic order', () => {
  const solo = createPreviewResult(entrants.slice(0, 1), 1, 'cat', 'own', false);
  assert.equal(solo.drawings.length, 1);
  assert.equal(getStandings(entrants.slice(0, 1), [solo])[0].total, solo.drawings[0].points);
  assert.deepEqual(getStandings([...entrants].reverse(), []).map(item => item.entrant.id), entrants.map(item => item.id));
});
