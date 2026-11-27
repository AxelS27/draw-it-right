// Every live prompt must be represented in the model's training labels (all 100 classes).
export const PROMPTS = [
  'apple', 'banana', 'bicycle', 'butterfly', 'cactus', 'car', 'circle', 'cloud', 'crown', 'donut',
  'door', 'eyeglasses', 'face', 'flower', 'flying saucer', 'hand', 'house', 'key', 'lightning', 'moon',
  'mountain', 'mushroom', 'pizza', 'rainbow', 'scissors', 'smiley face', 'snake', 'star', 'sun', 'tree',
  'airplane', 'alarm clock', 'ambulance', 'axe', 'backpack', 'baseball bat', 'bed', 'birthday cake', 'bridge', 'bus',
  'camera', 'campfire', 'candle', 'cat', 'chair', 'clock', 'coffee cup', 'computer', 'dog', 'fish',
  'guitar', 'hammer', 'headphones', 'helicopter', 'ice cream', 'laptop', 'light bulb', 'lighthouse', 'octopus', 'palm tree',
  'pants', 'pencil', 'cell phone', 'pig', 'sailboat', 'skyscraper', 'spider', 'sword', 't-shirt', 'umbrella',
  'animal migration', 'anvil', 'binoculars', 'brain', 'bulldozer', 'camouflage', 'chandelier', 'compass', 'dishwasher', 'dragon',
  'fire hydrant', 'hedgehog', 'hot air balloon', 'hourglass', 'hurricane', 'lobster', 'mermaid', 'power outlet', 'radio', 'roller coaster',
  'saxophone', 'sea turtle', 'stethoscope', 'submarine', 'The Eiffel Tower', 'The Mona Lisa', 'tornado', 'traffic light', 'washing machine', 'windmill',
] as const;
export type Phase = 'reveal' | 'drawing' | 'judging' | 'results' | 'leaderboard' | 'final';
export type Player = { username: string; avatar: Record<string, string> };
export type Entry = { points: number; submitted: boolean; prediction: string; confidence: number; coins: number; remaining: number };
export type Prediction = { class: string; confidence: number; targetConfidence: number } | null;
export type RoundEvent = 'normal' | 'speed_blitz' | 'double_points' | 'no_undo' | 'fat_brush' | 'precision' | 'upside_down' | 'shake' | 'tiny_brush' | 'ghost_ink' | 'mirror_x';
export type AttackType = 'upside_down' | 'shake' | 'no_undo' | 'tiny_brush' | 'ghost_ink' | 'mirror_x';
export type EventOfferKind = 'sabotage' | 'round_chaos';
export type ActiveAttack = { type: AttackType; from: string };
export type EventAnnouncement = { round: number; from: string; kind: EventOfferKind; detail: string };
export const ROUND_EVENTS: readonly Exclude<RoundEvent, 'normal'>[] = ['speed_blitz', 'double_points', 'no_undo', 'fat_brush', 'precision', 'upside_down', 'shake', 'tiny_brush', 'ghost_ink', 'mirror_x'];
export const ATTACK_TYPES: readonly AttackType[] = ['upside_down', 'shake', 'no_undo', 'tiny_brush', 'ghost_ink', 'mirror_x'];
export type RoundResult = { round: number; prompt: string; entries: Record<string, Entry> };
export type Match = {
  session: number; phase: Phase; round: number; prompt: string; promptOrder: string[]; deadline: number; rounds: number; timer: number;
  doublePoints: boolean; roundEvent: RoundEvent; players: Record<string, Player>; order: string[];
  scores: Record<string, number>; submitted: Record<string, Entry>; results: RoundResult[];
  awards: Record<string, number>; awarded: string[];
  eventOffers: Record<string, EventOfferKind>; pendingAttacks: Record<string, ActiveAttack>; eventLog: EventAnnouncement[];
};

export function createMatch(players: Record<string, Player>, order: string[], rounds: number, timer: number, doublePoints: boolean, now: number, session = 1, roll: () => number = Math.random): Match {
  if (order.length < 2 || order.length > 40 || rounds < 1 || rounds > 10 || timer < 10 || timer > 300) throw new Error('Invalid room settings');
  const pool: string[] = [...PROMPTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const promptOrder = pool.slice(0, rounds);
  return { session, phase: 'reveal', round: 1, prompt: promptOrder[0]!, promptOrder, deadline: now + 3000, rounds, timer, doublePoints,
    roundEvent: 'normal', players, order, scores: Object.fromEntries(order.map(uid => [uid, 0])), submitted: {}, results: [], awards: {}, awarded: [],
    eventOffers: {}, pendingAttacks: {}, eventLog: [] };
}

export function addLatePlayer(match: Match, uid: string, profile: Player): { match: Match; added: boolean } {
  if (match.phase === 'final' || uid in match.players || match.order.length >= 40) return { match, added: false };
  return {
    match: {
      ...match,
      players: { ...match.players, [uid]: profile },
      order: [...match.order, uid],
      scores: { ...match.scores, [uid]: 0 },
    },
    added: true,
  };
}

export function rematch(match: Match, now: number, roll: () => number = Math.random): Match {
  if (match.phase !== 'final') return match;
  return createMatch(match.players, match.order, match.rounds, match.timer, match.doublePoints, now, match.session + 1, roll);
}

export function applyEventChoice(
  match: Match,
  fromUid: string,
  choice: { kind: 'sabotage'; attack: AttackType } | { kind: 'round_chaos'; roundEvent: Exclude<RoundEvent, 'normal'> },
  roll: () => number = Math.random,
): { match: Match; accepted: boolean } {
  const offer = match.eventOffers[fromUid];
  if ((match.phase !== 'reveal' && match.phase !== 'drawing') || !offer) return { match, accepted: false };
  const nextOffers = { ...match.eventOffers };
  delete nextOffers[fromUid];
  if (choice.kind === 'sabotage') {
    if (!ATTACK_TYPES.includes(choice.attack)) return { match, accepted: false };
    const candidates = match.order.filter(id => id !== fromUid && !(id in match.pendingAttacks));
    if (!candidates.length) return { match, accepted: false };
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(roll() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }
    const targetCount = Math.max(1, Math.ceil((match.order.length - 1) * 0.4));
    const targets = candidates.slice(0, Math.min(candidates.length, targetCount));
    const nextAttacks = { ...match.pendingAttacks };
    for (const targetUid of targets) nextAttacks[targetUid] = { type: choice.attack, from: fromUid };
    return {
      match: {
        ...match,
        eventOffers: nextOffers,
        pendingAttacks: nextAttacks,
        eventLog: [...match.eventLog, { round: match.round, from: fromUid, kind: 'sabotage', detail: `${choice.attack}:${targets.join(',')}` }],
      },
      accepted: true,
    };
  }
  if (!ROUND_EVENTS.includes(choice.roundEvent)) return { match, accepted: false };
  return {
    match: {
      ...match,
      eventOffers: nextOffers,
      roundEvent: choice.roundEvent,
      eventLog: [...match.eventLog, { round: match.round, from: fromUid, kind: 'round_chaos', detail: choice.roundEvent }],
    },
    accepted: true,
  };
}

export function submit(match: Match, uid: string, now: number): { match: Match; accepted: boolean } {
  if (match.phase !== 'drawing' || now >= match.deadline || !(uid in match.players) || match.submitted[uid]) return { match, accepted: false };
  const entry: Entry = { points: 0, submitted: true, prediction: '', confidence: 0, coins: 0, remaining: Math.max(0, match.deadline - now) };
  return { match: { ...match, submitted: { ...match.submitted, [uid]: entry } }, accepted: true };
}

export function finishJudging(match: Match, predictions: Record<string, Prediction>, now: number): Match {
  if (match.phase !== 'judging') return match;
  const entries: Record<string, Entry> = {};
  const effectiveTimer = match.roundEvent === 'speed_blitz' ? Math.max(12, Math.round(match.timer / 2)) : match.timer;
  const multiplier = (match.roundEvent === 'double_points' || (match.round === match.rounds && match.doublePoints)) ? 2 : 1;
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
    const speedBase = match.roundEvent === 'speed_blitz' ? 500 : 250;
    const precisionBonus = match.roundEvent === 'precision' && prediction.confidence >= 0.85 ? 400 : 0;
    const points = (correct ? 500 : 0) + Math.round(1000 * prediction.targetConfidence) + Math.round(speedBase * submission.remaining / (effectiveTimer * 1000)) + (streak ? 250 : 0) + precisionBonus;
    entries[uid] = { ...submission, points: points * multiplier, prediction: prediction.class, confidence: prediction.confidence, coins: 20 };
  }
  return { ...match, phase: 'results', deadline: now + 15000, submitted: {}, pendingAttacks: {}, eventOffers: {},
    scores: Object.fromEntries(match.order.map(uid => [uid, match.scores[uid]! + entries[uid]!.points])),
    results: [...match.results, { round: match.round, prompt: match.prompt, entries }] };
}

function finalizeMatch(match: Match): Match {
  const ranking = match.order.filter(uid => match.results.some(result => result.entries[uid]?.submitted)).sort((a, b) => match.scores[b]! - match.scores[a]! || match.order.indexOf(a) - match.order.indexOf(b));
  const bonuses = [150, 100, 50];
  return { ...match, phase: 'final', deadline: 0, awards: Object.fromEntries(match.order.map(uid => [uid, match.results.reduce((sum, result) => sum + result.entries[uid]!.coins, 0) + (ranking.indexOf(uid) < 0 ? 0 : bonuses[ranking.indexOf(uid)] ?? 0)])) };
}

export function advance(match: Match, now: number, roll: () => number = Math.random): Match {
  if (match.phase === 'final' || now < match.deadline) return match;
  if (match.phase === 'reveal') {
    const roundSeconds = match.roundEvent === 'speed_blitz' ? Math.max(12, Math.round(match.timer / 2)) : match.timer;
    return { ...match, phase: 'drawing', deadline: now + roundSeconds * 1000 };
  }
  if (match.phase === 'drawing') return { ...match, phase: 'judging', deadline: now + 1000 };
  // Judging ends only when a verified model response is saved. The alarm retries failures.
  if (match.phase === 'judging') return match;
  if (match.phase === 'results') {
    if (match.round >= match.rounds) return finalizeMatch(match);
    return { ...match, phase: 'leaderboard', deadline: now + 10000 };
  }
  if (match.phase === 'leaderboard' && match.round < match.rounds) {
    // Surprise event cards: ~50% chance on round 2+ so events don't happen every round/match.
    const eventOffers: Record<string, EventOfferKind> = {};
    if (roll() < 0.5) {
      const maxLucky = Math.max(1, Math.min(match.order.length - 1, Math.ceil(match.order.length * 0.45)));
      for (const uid of match.order) {
        if (Object.keys(eventOffers).length >= maxLucky) break;
        if (roll() < 0.45) eventOffers[uid] = roll() < 0.7 ? 'sabotage' : 'round_chaos';
      }
      if (!Object.keys(eventOffers).length) {
        const picked = match.order[Math.floor(roll() * match.order.length)]!;
        eventOffers[picked] = roll() < 0.7 ? 'sabotage' : 'round_chaos';
      }
    }
    return { ...match, phase: 'reveal', round: match.round + 1, prompt: match.promptOrder[match.round] ?? PROMPTS[match.round % PROMPTS.length]!, roundEvent: 'normal', deadline: now + 3000, submitted: {}, eventOffers };
  }
  const ranking = match.order.filter(uid => match.results.some(result => result.entries[uid]?.submitted)).sort((a, b) => match.scores[b]! - match.scores[a]! || match.order.indexOf(a) - match.order.indexOf(b));
  const bonuses = [150, 100, 50];
  return { ...match, phase: 'final', deadline: 0, awards: Object.fromEntries(match.order.map(uid => [uid, match.results.reduce((sum, result) => sum + result.entries[uid]!.coins, 0) + (ranking.indexOf(uid) < 0 ? 0 : bonuses[ranking.indexOf(uid)] ?? 0)])) };
}

export function publicMatch(match: Match, viewerUid?: string) {
  const { submitted, awarded, promptOrder, eventOffers, pendingAttacks, ...publicState } = match;
  return {
    ...publicState,
    judgingMode: 'model' as const,
    submissions: Object.keys(submitted),
    rewardsComplete: awarded.length === match.order.length,
    myEventOffer: viewerUid ? (eventOffers[viewerUid] ?? null) : null,
    myAttack: viewerUid ? (pendingAttacks[viewerUid] ?? null) : null,
    serverNow: Date.now(),
  };
}
