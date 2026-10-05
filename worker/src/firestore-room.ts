import type { Player } from './engine';

export type RoomInfo = { host: string; status: string; players: Record<string, Player>; joinOrder: string[]; options: { rounds: number; timer: number; doublePoints: boolean } };
export type FirestoreDocument = { name: string; updateTime: string; fields: Record<string, { mapValue?: { fields?: Record<string, unknown> }; arrayValue?: { values?: unknown[] } }> };
function field(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const f = value as Record<string, unknown>;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('booleanValue' in f) return f.booleanValue;
  if ('arrayValue' in f) return ((f.arrayValue as { values?: unknown[] })?.values ?? []).map(field);
  if ('mapValue' in f) return Object.fromEntries(Object.entries((f.mapValue as { fields?: Record<string, unknown> })?.fields ?? {}).map(([k, v]) => [k, field(v)]));
  return undefined;
}
export async function firestoreRoom(code: string, token: string, projectId: string): Promise<RoomInfo> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${code}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Room read failed (${response.status})`);
  const raw = await response.json() as { fields?: Record<string, unknown> };
  const data = Object.fromEntries(Object.entries(raw.fields ?? {}).map(([key, value]) => [key, field(value)])) as Record<string, unknown>;
  const players = data.players as Record<string, Player>;
  const options = data.options as RoomInfo['options'];
  if (!players || !options || !Array.isArray(data.joinOrder)) throw new Error('Create a new room to start a live match.');
  return { host: String(data.host), status: String(data.status), players, options, joinOrder: data.joinOrder as string[] };
}

// Write as the departing/host player, under the existing Firestore Security Rules.
export async function changeFirestoreRoom(code: string, token: string, projectId: string, uid: string, close: boolean, stillDisconnected?: () => boolean): Promise<boolean> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${code}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const read = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!read.ok) throw new Error(`Room read failed (${read.status})`);
    const doc = await read.json() as FirestoreDocument;
    if (stillDisconnected && !stillDisconnected()) return true;
    const status = field(doc.fields.status);
    if (status === 'closed') return true;
    const host = field(doc.fields.host);
    const players = { ...doc.fields.players?.mapValue?.fields };
    const order = (doc.fields.joinOrder?.arrayValue?.values ?? []).map(field) as string[];
    if (!players[uid]) return true;
    if (close && host !== uid) return false;
    const updates: Record<string, unknown> = {};
    if (close || (host === uid && order.length === 1)) updates.status = { stringValue: 'closed' };
    else {
      delete players[uid];
      const remaining = order.filter(id => id !== uid);
      updates.players = { mapValue: { fields: players } };
      updates.joinOrder = { arrayValue: { values: remaining.map(id => ({ stringValue: id })) } };
      if (host === uid) updates.host = { stringValue: remaining[0] };
    }
    const query = new URLSearchParams();
    for (const key of Object.keys(updates)) query.append('updateMask.fieldPaths', key);
    query.set('currentDocument.updateTime', doc.updateTime);
    const written = await fetch(`${url}?${query}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: updates }) });
    if (written.ok) return true;
    if (written.status !== 409 && written.status !== 412) throw new Error(`Room update failed (${written.status})`);
  }
  return false;
}
