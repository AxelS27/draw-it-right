// Every live prompt must be represented in the model's training labels.
export const PROMPTS = ['cat', 'house', 'tree', 'fish', 'flower', 'sun', 'car'] as const;
export type Phase = 'reveal' | 'drawing' | 'judging' | 'results' | 'leaderboard' | 'final';
export type Player = { username: string; avatar: Record<string, string> };
export type Entry = { points: number; submitted: boolean; prediction: string; confidence: number; coins: number; remaining: number };
export type Prediction = { class: string; confidence: number; targetConfidence: number } | null;
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

export function submit(match: Match, uid: string, now: number): { match: Match; accepted: boolean } {
  if (match.phase !== 'drawing' || now >= match.deadline || !(uid in match.players) || match.submitted[uid]) return { match, accepted: false };
  const entry: Entry = { points: 0, submitted: true, prediction: '', confidence: 0, coins: 0, remaining: Math.max(0, match.deadline - now) };
  return { match: { ...match, submitted: { ...match.submitted, [uid]: entry } }, accepted: true };
}

export function finishJudging(match: Match, predictions: Record<string, Prediction>, now: number): Match {
  if (match.phase !== 'judging') return match;
  const entries: Record<string, Entry> = {};
  for (const uid of match.order) {
    const submission = match.submitted[uid];
    const prediction = predictions[uid];
    if (!submission || !prediction) {
      entries[uid] = { points: 0, submitted: Boolean(submission), prediction: submission ? 'No recognizable drawing' : 'No drawing', confidence: 0, coins: 0, remaining: 0 };
      continue;
    }
    const correct = prediction.class.toLowerCase() === match.prompt.toLowerCase();
    const previous = match.results.at(-1);
    const streak = correct && previous !== undefined && previous.entries[uid]?.prediction.toLowerCase() === previous.prompt.toLowerCase();
    const points = (correct ? 500 : 0) + Math.round(1000 * prediction.targetConfidence) + Math.round(250 * submission.remaining / (match.timer * 1000)) + (streak ? 250 : 0);
    entries[uid] = { ...submission, points: points * (match.round === match.rounds && match.doublePoints ? 2 : 1), prediction: prediction.class, confidence: prediction.confidence, coins: 20 };
  }
  return { ...match, phase: 'results', deadline: now + 15000, submitted: {},
    scores: Object.fromEntries(match.order.map(uid => [uid, match.scores[uid]! + entries[uid]!.points])),
    results: [...match.results, { round: match.round, prompt: match.prompt, entries }] };
}

export function advance(match: Match, now: number): Match {
  if (match.phase === 'final' || now < match.deadline) return match;
  if (match.phase === 'reveal') return { ...match, phase: 'drawing', deadline: now + match.timer * 1000 };
  if (match.phase === 'drawing') return { ...match, phase: 'judging', deadline: now + 1000 };
  // Judging ends only when a verified model response is saved. The alarm retries failures.
  if (match.phase === 'judging') return match;
  if (match.phase === 'results') return { ...match, phase: 'leaderboard', deadline: now + 10000 };
  if (match.round < match.rounds) return { ...match, phase: 'reveal', round: match.round + 1, prompt: PROMPTS[match.round % PROMPTS.length]!, deadline: now + 3000, submitted: {} };
  const ranking = match.order.filter(uid => match.results.some(result => result.entries[uid]?.submitted)).sort((a, b) => match.scores[b]! - match.scores[a]! || match.order.indexOf(a) - match.order.indexOf(b));
  const bonuses = [150, 100, 50];
  return { ...match, phase: 'final', deadline: 0, awards: Object.fromEntries(match.order.map(uid => [uid, match.results.reduce((sum, result) => sum + result.entries[uid]!.coins, 0) + (ranking.indexOf(uid) < 0 ? 0 : bonuses[ranking.indexOf(uid)] ?? 0)])) };
}

export function publicMatch(match: Match) {
  const { submitted, awarded, ...publicState } = match;
  return { ...publicState, judgingMode: 'model' as const, submissions: Object.keys(submitted), rewardsComplete: awarded.length === match.order.length, serverNow: Date.now() };
}
