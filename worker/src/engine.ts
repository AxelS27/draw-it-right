export const PROMPTS = ['cat', 'house', 'tree', 'fish', 'flower', 'rocket', 'sun'] as const;
export type Phase = 'reveal' | 'drawing' | 'judging' | 'results' | 'final';
export type Player = { username: string; avatar: Record<string, string> };
export type Entry = { points: number; submitted: boolean; prediction: string; coins: number };
export type RoundResult = { round: number; prompt: string; entries: Record<string, Entry> };
export type Match = {
  session: number; phase: Phase; round: number; prompt: string; deadline: number; rounds: number; timer: number;
  doublePoints: boolean; players: Record<string, Player>; order: string[];
  scores: Record<string, number>; submitted: Record<string, Entry>; results: RoundResult[];
  awards: Record<string, number>; awarded: string[];
};

export function createMatch(players: Record<string, Player>, order: string[], rounds: number, timer: number, doublePoints: boolean, now: number, session = 1): Match {
  if (order.length < 2 || order.length > 40 || rounds < 1 || rounds > 10 || timer < 10 || timer > 300) throw new Error('Invalid room settings');
  return { session, phase: 'reveal', round: 1, prompt: PROMPTS[0], deadline: now + 3000, rounds, timer, doublePoints,
    players, order, scores: Object.fromEntries(order.map(uid => [uid, 0])), submitted: {}, results: [], awards: {}, awarded: [] };
}

function samplePoints(uid: string, round: number, remaining: number, timer: number, doublePoints: boolean): number {
  let hash = 0;
  for (const char of `${uid}:${round}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (700 + hash % 401 + Math.floor(Math.max(0, remaining) / timer * 250)) * (doublePoints ? 2 : 1);
}

export function submit(match: Match, uid: string, now: number): { match: Match; accepted: boolean } {
  if (match.phase !== 'drawing' || now >= match.deadline || !(uid in match.players) || match.submitted[uid]) return { match, accepted: false };
  const last = match.round === match.rounds && match.doublePoints;
  const entry: Entry = { points: samplePoints(uid, match.round, (match.deadline - now) / 1000, match.timer, last), submitted: true, prediction: 'Mock judging - no AI prediction', coins: 20 };
  return { match: { ...match, submitted: { ...match.submitted, [uid]: entry } }, accepted: true };
}

export function advance(match: Match, now: number): Match {
  if (match.phase === 'final' || now < match.deadline) return match;
  if (match.phase === 'reveal') return { ...match, phase: 'drawing', deadline: now + match.timer * 1000 };
  if (match.phase === 'drawing') return { ...match, phase: 'judging', deadline: now + 2000 };
  if (match.phase === 'judging') {
    const entries: Record<string, Entry> = Object.fromEntries(match.order.map(uid => [uid, match.submitted[uid] ?? { points: 0, submitted: false, prediction: 'No drawing', coins: 0 }]));
    return { ...match, phase: 'results', deadline: now + 10000,
      scores: Object.fromEntries(match.order.map(uid => [uid, match.scores[uid]! + entries[uid]!.points])),
      results: [...match.results, { round: match.round, prompt: match.prompt, entries }] };
  }
  if (match.round < match.rounds) return { ...match, phase: 'reveal', round: match.round + 1, prompt: PROMPTS[match.round % PROMPTS.length]!, deadline: now + 3000, submitted: {} };
  const ranking = match.order.filter(uid => match.results.some(result => result.entries[uid]?.submitted)).sort((a, b) => match.scores[b]! - match.scores[a]! || match.order.indexOf(a) - match.order.indexOf(b));
  const bonuses = [150, 100, 50];
  return { ...match, phase: 'final', deadline: 0, awards: Object.fromEntries(match.order.map(uid => [uid, match.results.reduce((sum, result) => sum + result.entries[uid]!.coins, 0) + (ranking.indexOf(uid) < 0 ? 0 : bonuses[ranking.indexOf(uid)] ?? 0)])) };
}

export function publicMatch(match: Match) {
  const { submitted, awarded, ...publicState } = match;
  return { ...publicState, submissions: Object.keys(submitted), rewardsComplete: awarded.length === match.order.length, serverNow: Date.now() };
}
