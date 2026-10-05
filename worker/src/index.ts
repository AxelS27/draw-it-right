import { DurableObject } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { advance, createMatch, publicMatch, submit, type Match, type Player } from './engine';

interface Env {
  MATCHES: DurableObjectNamespace<MatchRoom>;
  WALLETS: DurableObjectNamespace<PlayerWallet>;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
}
type RoomInfo = { host: string; status: string; players: Record<string, Player>; joinOrder: string[]; options: { rounds: number; timer: number; doublePoints: boolean } };
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const prices: Record<string, number> = { crown: 350, headphones: 250, bow: 150, shades: 200, cat: 400, bunny: 400, robot: 450, bear: 400, rose: 100, lilac: 100, gold: 100 };

async function verify(token: string, projectId: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwks, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] });
  if (!payload.sub || typeof payload.auth_time !== 'number' || payload.auth_time > Date.now() / 1000) throw new Error('Invalid token');
  return payload.sub;
}
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
async function firestoreRoom(code: string, token: string, projectId: string): Promise<RoomInfo> {
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
      const route = /^\/rooms\/(\d{6})\/(socket|submit|draft|rematch|drawing\/\d+\/[A-Za-z0-9_-]+)$/.exec(url.pathname);
      const socket = route?.[2] === 'socket';
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
      if (room.status !== 'started' || !room.players[uid]) return fail('You are not in an active match', 403);
      const headers = new Headers(request.headers);
      headers.set('X-Verified-Uid', uid);
      headers.set('X-Room-Info', encodeURIComponent(JSON.stringify(room)));
      if (socket || route[2] === 'rematch') headers.set('X-Room-Token', token);
      const stub = env.MATCHES.get(env.MATCHES.idFromName(code));
      const result = await stub.fetch(new Request(request, { headers }));
      if (socket) return result;
      return new Response(result.body, { status: result.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (failure) { return fail(failure instanceof Error ? failure.message : 'Request failed', 401); }
  },
};

export class MatchRoom extends DurableObject<Env> {
  private async state(): Promise<Match | undefined> { return this.ctx.storage.get<Match>('state'); }
  private broadcast(match: Match) {
    const message = JSON.stringify({ type: 'match', match: publicMatch(match) });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(message); } catch { ws.close(1011, 'Disconnected'); } }
  }
  private async save(match: Match) {
    await this.ctx.storage.put('state', match);
    if (match.phase !== 'final') await this.ctx.storage.setAlarm(match.deadline);
    this.broadcast(match);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const uid = request.headers.get('X-Verified-Uid');
    if (!uid) return error('Unauthorized', 401);
    let match = await this.state();
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
    if (url.pathname.endsWith('/rematch') && request.method === 'POST') {
      const room = JSON.parse(decodeURIComponent(request.headers.get('X-Room-Info') ?? '')) as RoomInfo;
      if (room.host !== uid || match.phase !== 'final' || match.awarded.length !== match.order.length) return error('Only the host can start a rematch after rewards finish', 403);
      const next = createMatch(room.players, room.joinOrder.filter(id => room.players[id]), room.options.rounds, room.options.timer, room.options.doublePoints, Date.now(), match.session + 1);
      await this.ctx.storage.put('roomToken', request.headers.get('X-Room-Token'));
      await this.save(next);
      return Response.json({ started: true });
    }
    if (url.pathname.endsWith('/socket')) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error('WebSocket required');
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
  async alarm() {
    let match = await this.state();
    if (!match) return;
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
    else await this.ctx.storage.setAlarm(match.deadline);
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
