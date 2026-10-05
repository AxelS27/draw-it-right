import { DurableObject } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { advance, createMatch, publicMatch, submit, type Match } from './engine';
import { changeFirestoreRoom, firestoreRoom, type RoomInfo } from './firestore-room';

interface Env {
  MATCHES: DurableObjectNamespace<MatchRoom>;
  WALLETS: DurableObjectNamespace<PlayerWallet>;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
}
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const prices: Record<string, number> = { crown: 350, headphones: 250, bow: 150, shades: 200, cat: 400, bunny: 400, robot: 450, bear: 400, rose: 100, lilac: 100, gold: 100 };

async function verify(token: string, projectId: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwks, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] });
  if (!payload.sub || typeof payload.auth_time !== 'number' || payload.auth_time > Date.now() / 1000) throw new Error('Invalid token');
  return payload.sub;
}
function error(message: string, status = 400): Response { return Response.json({ error: message }, { status }); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map(item => item.trim());
    if (origin && !allowed.includes(origin)) return error('Origin not allowed', 403);
    const cors = { 'Access-Control-Allow-Origin': origin || allowed[0] || '', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const fail = (message: string, status: number) => Response.json({ error: message }, { status, headers: cors });
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') return Response.json({ ok: true }, { headers: cors });
      const route = /^\/rooms\/(\d{6})\/(presence|socket|submit|draft|drawing\/\d+\/[A-Za-z0-9_-]+)$/.exec(url.pathname);
      const socket = route?.[2] === 'socket' || route?.[2] === 'presence';
      const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(s => s.trim()) ?? [];
      const token = socket && protocols[0] === 'firebase' ? protocols[1] : request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!token || token.length > 4096) return fail('Log in first', 401);
      const uid = await verify(token, env.FIREBASE_PROJECT_ID);
      if (url.pathname === '/wallet' || url.pathname === '/wallet/buy') {
        const stub = env.WALLETS.get(env.WALLETS.idFromName(uid));
        const headers = new Headers(request.headers); headers.set('X-Verified-Uid', uid);
        const result = await stub.fetch(new Request(request, { headers }));
        return new Response(result.body, { status: result.status, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (!route) return fail('Not found', 404);
      const code = route[1]!;
      const room = await firestoreRoom(code, token, env.FIREBASE_PROJECT_ID);
      if (!room.players[uid] || (route[2] === 'presence' ? !['waiting', 'started'].includes(room.status) : room.status !== 'started')) return fail('You are not in this room', 403);
      const headers = new Headers(request.headers);
      headers.set('X-Verified-Uid', uid);
      headers.set('X-Room-Info', encodeURIComponent(JSON.stringify(room)));
      if (socket) headers.set('X-Room-Token', token);
      const stub = env.MATCHES.get(env.MATCHES.idFromName(code));
      const result = await stub.fetch(new Request(request, { headers }));
      if (socket) return result;
      return new Response(result.body, { status: result.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (failure) { return fail(failure instanceof Error ? failure.message : 'Request failed', 401); }
  },
};

export class MatchRoom extends DurableObject<Env> {
  private async state(): Promise<Match | undefined> { return this.ctx.storage.get<Match>('state'); }
  private async schedule(match?: Match) {
    const grace = await this.ctx.storage.get<Record<string, number>>('disconnects') ?? {};
    const deadlines = Object.values(grace);
    if (match?.phase === 'final' && !await this.ctx.storage.get('roomClosed')) deadlines.push(Date.now() + (match.awarded.length === match.order.length ? 10000 : 60000));
    else if (match && match.phase !== 'final') deadlines.push(match.deadline);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  private async updateDisconnect(uid: string, deadline: number | null, expected?: number): Promise<boolean> {
    return this.ctx.storage.transaction(async storage => {
      const grace = await storage.get<Record<string, number>>('disconnects') ?? {};
      if (expected !== undefined && grace[uid] !== expected) return false;
      if (deadline === null) delete grace[uid];
      else grace[uid] = deadline;
      await storage.put('disconnects', grace);
      return true;
    });
  }
  private connected(uid: string, closing?: WebSocket): boolean {
    return this.ctx.getWebSockets().some(socket => {
      if (socket === closing || socket.readyState !== WebSocket.OPEN) return false;
      const attachment = socket.deserializeAttachment() as { uid?: string; kind?: string } | null;
      return attachment?.uid === uid && attachment.kind === 'presence';
    });
  }
  async webSocketError(socket: WebSocket) {
    try { socket.close(1011, 'Connection error'); } catch { /* Already disconnected. */ }
  }
  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const attachment = socket.deserializeAttachment() as { uid?: string; kind?: string } | null;
    try { socket.close(code === 1006 ? 1000 : code, reason); } catch { /* The client already disconnected. */ }
    if (attachment?.kind !== 'presence' || !attachment.uid || this.connected(attachment.uid, socket)) return;
    await this.updateDisconnect(attachment.uid, Date.now() + 60000);
    await this.schedule(await this.state());
  }
  private broadcast(match: Match) {
    const message = JSON.stringify({ type: 'match', match: publicMatch(match) });
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as { kind?: string } | null)?.kind === 'presence') continue;
      try { ws.send(message); } catch { ws.close(1011, 'Disconnected'); }
    }
  }
  private async save(match: Match) {
    await this.ctx.storage.put('state', match);
    await this.schedule(match);
    this.broadcast(match);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const uid = request.headers.get('X-Verified-Uid');
    if (!uid) return error('Unauthorized', 401);
    let match = await this.state();
    if (url.pathname.endsWith('/presence')) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error('WebSocket required');
      const token = request.headers.get('X-Room-Token');
      if (!token) return error('Missing login', 401);
      await this.ctx.storage.put(`token:${uid}`, token);
      await this.updateDisconnect(uid, null);
      await this.schedule(match);
      const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server); server.serializeAttachment({ uid, kind: 'presence' });
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'firebase' } });
    }
    if (!match && url.pathname.endsWith('/socket')) {
      const room = JSON.parse(decodeURIComponent(request.headers.get('X-Room-Info') ?? '')) as RoomInfo;
      match = await this.ctx.storage.transaction(async storage => {
        const existing = await storage.get<Match>('state');
        if (existing) return existing;
        const initial = createMatch(room.players, room.joinOrder, room.options.rounds, room.options.timer, room.options.doublePoints, Date.now());
        await storage.put('state', initial);
        await storage.put('roomToken', request.headers.get('X-Room-Token'));
        await storage.setAlarm(initial.deadline);
        return initial;
      });
    }
    if (!match || !match.players[uid]) return error('Match not found', 404);
    if (url.pathname.endsWith('/socket')) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error('WebSocket required');
      const matchToken = request.headers.get('X-Room-Token');
      if (matchToken) await this.ctx.storage.put(`token:${uid}`, matchToken);
      const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server); server.serializeAttachment({ uid });
      server.send(JSON.stringify({ type: 'match', match: publicMatch(match) }));
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'firebase' } });
    }
    const drawing = /^\/rooms\/\d{6}\/drawing\/(\d+)\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (drawing && request.method === 'GET') {
      const round = Number(drawing[1]); const owner = drawing[2]!;
      if (round < 1 || round > match.results.length || !match.players[owner]) return error('Drawing not available', 404);
      return Response.json({ image: await this.ctx.storage.get<string>(`image:${match.session}:${round}:${owner}`) ?? '' });
    }
    if ((url.pathname.endsWith('/submit') || url.pathname.endsWith('/draft')) && request.method === 'POST') {
      if (Number(request.headers.get('Content-Length') ?? 0) > 190000) return error('Drawing is too large (max 135 KB)', 413);
      const raw = await request.text();
      if (raw.length > 190000) return error('Drawing is too large (max 135 KB)', 413);
      const body = JSON.parse(raw) as { image?: unknown };
      const emptyDraft = url.pathname.endsWith('/draft') && body.image === null;
      if (!emptyDraft) {
        if (typeof body.image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image) || body.image.length < 2500 || body.image.length > 180000) return error('Invalid drawing (max 135 KB)');
        const bytes = atob(body.image.slice('data:image/jpeg;base64,'.length));
        if (bytes.charCodeAt(0) !== 255 || bytes.charCodeAt(1) !== 216 || bytes.charCodeAt(2) !== 255 || bytes.charCodeAt(bytes.length - 2) !== 255 || bytes.charCodeAt(bytes.length - 1) !== 217) return error('Invalid JPEG drawing');
      }
      if (url.pathname.endsWith('/draft')) {
        const saved = await this.ctx.storage.transaction(async storage => {
          const latest = await storage.get<Match>('state');
          if (!latest || latest.phase !== 'drawing' || Date.now() >= latest.deadline || latest.submitted[uid]) return false;
          if (emptyDraft) await storage.delete(`image:${latest.session}:${latest.round}:${uid}`);
          else await storage.put(`image:${latest.session}:${latest.round}:${uid}`, body.image);
          return true;
        });
        return saved ? Response.json({ saved: true }) : error('Drawing time has ended', 409);
      }
      if (emptyDraft) return error('A blank drawing cannot be submitted');
      const result = await this.ctx.storage.transaction(async storage => {
        const latest = await storage.get<Match>('state');
        if (!latest) return null;
        const next = submit(latest, uid, Date.now());
        if (!next.accepted) return null;
        await storage.put(`image:${latest.session}:${latest.round}:${uid}`, body.image);
        await storage.put('state', next.match);
        return next.match;
      });
      if (!result) return error('Submission closed or already sent', 409);
      this.broadcast(result);
      return Response.json({ accepted: true });
    }
    return error('Not found', 404);
  }
  private async expireDisconnects() {
    const code = this.ctx.id.name;
    if (!code) return;
    const grace = await this.ctx.storage.get<Record<string, number>>('disconnects') ?? {};
    for (const [uid, deadline] of Object.entries(grace).filter(([, time]) => time <= Date.now()).slice(0, 2)) {
      if (this.connected(uid)) { await this.updateDisconnect(uid, null, deadline); continue; }
      try {
        const token = await this.ctx.storage.get<string>(`token:${uid}`);
        if (!token || !await changeFirestoreRoom(code, token, this.env.FIREBASE_PROJECT_ID, uid, false, () => !this.connected(uid))) throw new Error('Retry disconnect');
        if (await this.updateDisconnect(uid, null, deadline) && !this.connected(uid)) await this.ctx.storage.delete(`token:${uid}`);
      } catch { await this.updateDisconnect(uid, Date.now() + 10000, deadline); }
    }
  }
  private async finishRoom(match: Match) {
    const code = this.ctx.id.name;
    if (!code || match.awarded.length < match.order.length) return;
    if (await this.ctx.storage.get('roomClosed')) { await this.schedule(match); return; }
    try {
      const tokens = [await this.ctx.storage.get<string>('roomToken'), ...await Promise.all(match.order.slice(0, 3).map(uid => this.ctx.storage.get<string>(`token:${uid}`)))];
      let room: RoomInfo | undefined;
      for (const token of new Set(tokens.filter((value): value is string => Boolean(value)))) {
        try { room = await firestoreRoom(code, token, this.env.FIREBASE_PROJECT_ID); break; } catch { /* Use another player's refreshed token. */ }
      }
      if (!room) throw new Error('No current room token');
      if (room.status === 'closed') { await this.ctx.storage.put('roomClosed', true); await this.schedule(match); return; }
      const hostToken = await this.ctx.storage.get<string>(`token:${room.host}`);
      if (!hostToken || !await changeFirestoreRoom(code, hostToken, this.env.FIREBASE_PROJECT_ID, room.host, true)) throw new Error('Host is unavailable');
      await this.ctx.storage.put('roomClosed', true);
      await this.schedule(match);
    } catch { await this.ctx.storage.setAlarm(Date.now() + 60000); }
  }
  async alarm() {
    await this.expireDisconnects();
    let match = await this.state();
    if (!match) { await this.schedule(); return; }
    if (match.phase === 'final') { await this.award(match); return; }
    const token = await this.ctx.storage.get<string>('roomToken');
    if (token) {
      try {
        const code = this.ctx.id.name;
        if (code && (await firestoreRoom(code, token, this.env.FIREBASE_PROJECT_ID)).status !== 'started') return;
      } catch { await this.ctx.storage.setAlarm(Date.now() + 10000); return; }
    }
    match = await this.state();
    if (!match || match.phase === 'final') return;
    if (match.phase === 'drawing' && Date.now() >= match.deadline) {
      let updated = match;
      for (const uid of match.order) {
        if (updated.submitted[uid]) continue;
        if (await this.ctx.storage.get(`image:${match.session}:${match.round}:${uid}`)) updated = submit(updated, uid, match.deadline - 1).match;
      }
      if (updated !== match) { match = updated; await this.ctx.storage.put('state', match); }
    }
    const next = advance(match, Date.now());
    if (next !== match) await this.save(next);
    else await this.schedule(match);
    if (next.phase === 'final') await this.award(next);
  }
  private async award(match: Match) {
    const roomCode = this.ctx.id.name;
    if (!roomCode) return;
    const awarded = new Set(match.awarded);
    for (const uid of match.order) {
      if (awarded.has(uid)) continue;
      try {
        const stub = this.env.WALLETS.get(this.env.WALLETS.idFromName(uid));
        const response = await stub.fetch(new Request('https://internal/award', { method: 'POST', body: JSON.stringify({ roomCode: `${roomCode}:${match.session}`, amount: match.awards[uid] ?? 0 }) }));
        if (!response.ok) throw new Error('Wallet unavailable');
        awarded.add(uid);
      } catch { /* Retry remaining awards, idempotently. */ }
    }
    if (awarded.size !== match.awarded.length) await this.save({ ...match, awarded: [...awarded] });
    if (awarded.size < match.order.length) await this.ctx.storage.setAlarm(Date.now() + 60000);
    else await this.finishRoom({ ...match, awarded: [...awarded] });
  }
}

export class PlayerWallet extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const balance = await this.ctx.storage.get<number>('balance') ?? 0;
    const owned = await this.ctx.storage.get<string[]>('owned') ?? [];
    if (url.pathname === '/award' && request.method === 'POST') {
      const body = await request.json() as { roomCode: string; amount: number };
      if (!/^\d{6}:\d+$/.test(body.roomCode) || !Number.isInteger(body.amount) || body.amount < 0 || body.amount > 500) return error('Invalid award');
      const updated = await this.ctx.storage.transaction(async storage => {
        if (await storage.get(`award:${body.roomCode}`)) return await storage.get<number>('balance') ?? 0;
        const current = await storage.get<number>('balance') ?? 0;
        await storage.put(`award:${body.roomCode}`, true);
        await storage.put('balance', current + body.amount);
        return current + body.amount;
      });
      return Response.json({ balance: updated });
    }
    if (!request.headers.get('X-Verified-Uid')) return error('Unauthorized', 401);
    if (url.pathname === '/wallet' && request.method === 'GET') return Response.json({ balance, owned });
    if (url.pathname === '/wallet/buy' && request.method === 'POST') {
      const body = await request.json() as { item?: string };
      const item = body.item;
      if (typeof item !== 'string' || !Object.hasOwn(prices, item)) return error('Unknown item');
      const purchase = await this.ctx.storage.transaction(async storage => {
        const current = await storage.get<number>('balance') ?? 0;
        const inventory = await storage.get<string[]>('owned') ?? [];
        if (inventory.includes(item)) return { balance: current, owned: inventory };
        if (current < prices[item]!) return null;
        const next = { balance: current - prices[item]!, owned: [...inventory, item] };
        await storage.put('balance', next.balance);
        await storage.put('owned', next.owned);
        return next;
      });
      return purchase ? Response.json(purchase) : error('Not enough coins');
    }
    return error('Not found', 404);
  }
}
