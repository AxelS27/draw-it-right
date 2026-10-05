import assert from 'node:assert/strict';
import test from 'node:test';
import { changeFirestoreRoom } from '../worker/src/firestore-room.ts';

const profile = { mapValue: { fields: { username: { stringValue: 'Player' } } } };
function document(host = 'alice', order = ['alice', 'bob']) {
  return { name: 'projects/draw-it-right/databases/(default)/documents/rooms/123456', updateTime: '2026-10-05T08:00:00.000000Z', fields: { host: { stringValue: host }, status: { stringValue: 'started' }, players: { mapValue: { fields: Object.fromEntries(order.map(uid => [uid, profile])) } }, joinOrder: { arrayValue: { values: order.map(uid => ({ stringValue: uid })) } } } };
}
async function runWithFirestore(doc, uid, close) {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return init?.method === 'PATCH' ? Response.json({ updateTime: doc.updateTime }) : Response.json(doc);
  };
  try {
    const success = await changeFirestoreRoom('123456', 'private-token', 'draw-it-right', uid, close);
    return { success, calls };
  } finally { globalThis.fetch = oldFetch; }
}

test('disconnect removes only that player with an update-time precondition', async () => {
  const { success, calls } = await runWithFirestore(document(), 'bob', false);
  assert.equal(success, true);
  assert.equal(calls.length, 2);
  const url = new URL(calls[1].url);
  assert.deepEqual(url.searchParams.getAll('updateMask.fieldPaths'), ['players', 'joinOrder']);
  assert.equal(url.searchParams.get('currentDocument.updateTime'), '2026-10-05T08:00:00.000000Z');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer private-token');
  const updated = JSON.parse(calls[1].init.body).fields;
  assert.deepEqual(Object.keys(updated.players.mapValue.fields), ['alice']);
  assert.deepEqual(updated.joinOrder.arrayValue.values, [{ stringValue: 'alice' }]);
});

test('host disconnect hands off to next player; last host closes room', async () => {
  const handoff = await runWithFirestore(document(), 'alice', false);
  const changes = JSON.parse(handoff.calls[1].init.body).fields;
  assert.equal(changes.host.stringValue, 'bob');
  assert.deepEqual(Object.keys(changes.players.mapValue.fields), ['bob']);
  const last = await runWithFirestore(document('alice', ['alice']), 'alice', false);
  assert.deepEqual(JSON.parse(last.calls[1].init.body).fields, { status: { stringValue: 'closed' } });
});

test('reconnection after room read cancels an in-flight disconnect', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(document()); };
  try {
    const result = await changeFirestoreRoom('123456', 'private-token', 'draw-it-right', 'bob', false, () => false);
    assert.equal(result, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('match completion closes the room as host, not another player', async () => {
  const denied = await runWithFirestore(document(), 'bob', true);
  assert.equal(denied.success, false);
  assert.equal(denied.calls.length, 1);
  const closed = await runWithFirestore(document(), 'alice', true);
  assert.deepEqual(JSON.parse(closed.calls[1].init.body).fields, { status: { stringValue: 'closed' } });
});
