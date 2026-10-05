import { auth } from './firebase';
import type { Profile } from './profile';

export type MatchEntry = { points: number; submitted: boolean; prediction: string; coins: number };
export type MatchResult = { round: number; prompt: string; entries: Record<string, MatchEntry> };
export type MatchState = {
  session: number; phase: 'reveal' | 'drawing' | 'judging' | 'results' | 'leaderboard' | 'final'; round: number; prompt: string; deadline: number;
  serverNow: number; rounds: number; timer: number; doublePoints: boolean; players: Record<string, Profile>;
  order: string[]; scores: Record<string, number>; submissions: string[]; results: MatchResult[];
  awards: Record<string, number>; rewardsComplete: boolean;
};
export type Wallet = { balance: number; owned: string[] };
export const matchApi = import.meta.env.VITE_MATCH_API_URL || (location.hostname === 'localhost' ? 'http://localhost:8787' : '');

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Log in to continue.');
  return user.getIdToken();
}
export async function matchRequest<T>(path: string, body?: object): Promise<T> {
  if (!matchApi) throw new Error('Match server is not configured for this site.');
  const response = await fetch(`${matchApi}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result ? String(result.error) : 'Match server unavailable.');
  return result as T;
}
async function openRoomSocket(code: string, endpoint: 'socket' | 'presence'): Promise<WebSocket> {
  if (!matchApi) throw new Error('Match server is not configured for this site.');
  const url = new URL(`${matchApi}/rooms/${code}/${endpoint}`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(url, ['firebase', await token()]);
}
export const openMatchSocket = (code: string) => openRoomSocket(code, 'socket');
export const openPresenceSocket = (code: string) => openRoomSocket(code, 'presence');
