import type { Profile } from './profile';

// Local demonstration data only. Never use these scores as authoritative results.
export const previewPrompts = ['cat', 'house', 'tree', 'fish', 'flower', 'rocket', 'sun'] as const;
export type PreviewPrompt = typeof previewPrompts[number];
export type Entrant = { id: number; profile: Profile; isYou: boolean };
export type RoundDrawing = { entrant: Entrant; image: string; points: number };
export type RoundResult = { round: number; prompt: string; multiplier: number; drawings: RoundDrawing[] };
export type Standing = { entrant: Entrant; total: number; added: number };
export type MatchPhase = 'drawing' | 'waiting' | 'judging' | 'results' | 'leaderboard' | 'final';
export type PreviewMatchState = { phase: MatchPhase; round: number; results: RoundResult[] };
export type MatchAction = { type: 'submit'; result: RoundResult; wait: boolean } | { type: 'judging' | 'results' | 'leaderboard' | 'restart' } | { type: 'next'; totalRounds: number };
export const initialMatch: PreviewMatchState = { phase: 'drawing', round: 1, results: [] };

export function matchReducer(state: PreviewMatchState, action: MatchAction): PreviewMatchState {
  switch (action.type) {
    case 'submit': return state.phase === 'drawing' && action.result.round === state.round ? { ...state, phase: action.wait ? 'waiting' : 'judging', results: [...state.results, action.result] } : state;
    case 'judging': return state.phase === 'waiting' ? { ...state, phase: 'judging' } : state;
    case 'results': return state.phase === 'judging' ? { ...state, phase: 'results' } : state;
    case 'leaderboard': return state.phase === 'results' ? { ...state, phase: 'leaderboard' } : state;
    case 'next': return state.phase === 'leaderboard' || (state.phase === 'results' && state.round === action.totalRounds) ? { ...state, phase: state.round < action.totalRounds ? 'drawing' : 'final', round: Math.min(state.round + 1, action.totalRounds) } : state;
    case 'restart': return initialMatch;
  }
}

const sketches: Record<PreviewPrompt, string[]> = {
  cat: ['M65 135 L65 62 L103 88 Q140 68 176 88 L215 62 L215 135 Q214 193 140 192 Q64 192 65 135Z', 'M104 122v6 M176 122v6 M130 147l10 8 10-8 M140 155v10 M140 165q-15 13-23 0 M140 165q15 13 23 0', 'M96 149l-49-8 M97 162l-47 9 M185 149l48-8 M184 162l49 9'],
  house: ['M49 113 L140 44 L230 113 M72 98v104h136V98', 'M122 202v-63h38v63 M88 122h22v25H88Z M175 122h22v25h-22Z', 'M188 79V47h20v48 M36 207h208'],
  tree: ['M126 148v58h28v-58', 'M87 150q-50-28-10-67-7-45 42-39 36-36 68 11 47 8 23 48 36 48-22 57Z', 'M140 174l-25-30 M140 155l23-22 M88 211h104'],
  fish: ['M49 124q70-99 145 0-75 95-145 0Z M194 124l46-43v84Z', 'M93 111v3 M111 81q28 42 0 84', 'M131 78l19-25 19 38 M140 163l15 24 16-39 M44 76h1 M29 52h1'],
  flower: ['M140 127v82 M140 182q-51 0-49-38 44 1 49 38 M140 164q45-1 42-34-35 1-42 34', 'M123 93q-54-30-19-53 25-10 36 25 21-48 48-22 13 23-22 44 53-6 47 28-11 26-50 3 19 49-15 52-30-3-23-43-42 30-56 0-11-26 37-29', 'M157 100a17 17 0 1 1-34 0 17 17 0 1 1 34 0'],
  rocket: ['M140 30q-57 53-44 134h88Q197 83 140 30Z', 'M156 92a16 16 0 1 1-32 0 16 16 0 1 1 32 0 M95 127l-32 50 34-12 M186 127l32 50-34-12', 'M115 174l-4 32 29-19 27 19-3-32 M51 52h12 M57 46v12 M224 64h12 M230 58v12'],
  sun: ['M190 119a50 50 0 1 1-100 0 50 50 0 1 1 100 0', 'M140 40V20 M140 198v20 M61 119H39 M220 119h21 M85 64L70 49 M195 64l15-15 M85 175l-15 15 M195 175l15 15', 'M120 109v5 M160 109v5 M117 136q23 23 46 0'],
};

function sampleImage(prompt: PreviewPrompt, id: number, round: number): string {
  const colors = ['#294f61', '#397c77', '#aa674b', '#80629b'];
  const paths = sketches[prompt].slice(0, 1 + (id + round) % 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 240"><rect width="280" height="240" fill="white"/><g fill="none" stroke="${colors[id % colors.length]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${id % 2 ? -4 : 3} 140 120)">${paths.map(path => `<path d="${path}"/>`).join('')}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function createPreviewResult(entrants: Entrant[], round: number, prompt: PreviewPrompt, image: string, doublePoints: boolean): RoundResult {
  const multiplier = doublePoints ? 2 : 1;
  const drawings = entrants.map(entrant => ({ entrant, image: entrant.isYou ? image : sampleImage(prompt, entrant.id, round), points: (700 + ((entrant.id * 293 + round * 197) % 1301)) * multiplier }));
  drawings.sort((a, b) => b.points - a.points || a.entrant.id - b.entrant.id);
  return { round, prompt, multiplier, drawings };
}

export function getStandings(entrants: Entrant[], results: RoundResult[]): Standing[] {
  return entrants.map(entrant => ({ entrant, total: results.reduce((total, result) => total + (result.drawings.find(item => item.entrant.id === entrant.id)?.points ?? 0), 0), added: results.at(-1)?.drawings.find(item => item.entrant.id === entrant.id)?.points ?? 0 })).sort((a, b) => b.total - a.total || a.entrant.id - b.entrant.id);
}
