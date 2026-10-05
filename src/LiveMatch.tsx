import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, LoaderCircle, MessageCircle, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { DrawingRound } from './DrawingRound';
import { RoomChat, type ChatMessage } from './RoomChat';
import { FinalPodium, RoundGallery, Standings } from './MatchResults';
import { roomError, sendMessage, watchMessages, type LiveMessage, type RoomOptions } from './rooms';
import { matchRequest, openMatchSocket, type MatchState } from './match-api';
import type { Entrant, RoundResult, Standing } from './preview-match';
import { useAudioScene } from './useAudio';
import './match-results.css';
import './live-match.css';

const loadingImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#fff"/><text x="400" y="250" text-anchor="middle" fill="#58777c" font-family="sans-serif" font-size="26">Loading drawing…</text></svg>');
type Props = { code: string; uid: string; isHost: boolean; options: RoomOptions; onLeave: () => void };

export function LiveMatch({ code, uid, isHost, options, onLeave }: Props) {
  const [state, setState] = useState<MatchState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [ownImages, setOwnImages] = useState<Record<string, string>>({});
  const [rematchBusy, setRematchBusy] = useState(false);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const chatDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useAudioScene(state?.phase === 'results' ? 'showcase' : state?.phase === 'final' ? 'podium' : state?.phase === 'judging' ? 'judging' : state?.phase === 'leaderboard' ? 'leaderboard' : state?.phase === 'drawing' && state.submissions.includes(uid) ? 'judging' : state?.phase === 'drawing' || state?.phase === 'reveal' ? 'drawing' : null, 2);

  useEffect(() => watchMessages(code, setMessages, setChatError), [code]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    async function connect() {
      try {
        socket = await openMatchSocket(code);
        if (disposed) { socket.close(); return; }
        socket.onopen = () => setError('');
        socket.onmessage = event => {
          try {
            const message = JSON.parse(event.data as string) as { type: string; match: MatchState };
            if (message.type === 'match') {
              setOffset(Date.now() - message.match.serverNow);
              setState(message.match);
              setError('');
            }
          } catch { setError('Couldn’t read match state. Reconnecting…'); }
        };
        socket.onclose = () => { if (!disposed) { setError('Connection lost. Reconnecting…'); retry = window.setTimeout(() => void connect(), 2500); } };
        socket.onerror = () => socket?.close();
      } catch (failure) {
        if (!disposed) { setError(failure instanceof Error ? failure.message : 'Couldn’t connect to the match.'); retry = window.setTimeout(() => void connect(), 3500); }
      }
    }
    void connect();
    return () => { disposed = true; if (retry) window.clearTimeout(retry); socket?.close(); };
  }, [code]);
  useEffect(() => { if (state?.phase === 'final' && state.rewardsComplete) window.dispatchEvent(new Event('wallet-updated')); }, [state?.session, state?.phase, state?.rewardsComplete]);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
    if (!chatDialog.current?.open) heading.current?.focus({ preventScroll: true });
  }, [state?.phase]);

  const lastResult = state?.results.at(-1);
  useEffect(() => {
    if (!state || state.phase !== 'results' || !lastResult) return;
    let active = true;
    const session = state.session;
    void Promise.all(state.order.filter(id => lastResult.entries[id]?.submitted).map(async id => {
      try {
        const response = await matchRequest<{ image: string }>(`/rooms/${code}/drawing/${lastResult.round}/${id}`);
        return [id, response.image] as const;
      } catch { return [id, ''] as const; }
    })).then(drawings => {
      if (!active) return;
      setImages(current => ({ ...current, ...Object.fromEntries(drawings.filter(([, image]) => image).map(([id, image]) => [`${session}:${lastResult.round}:${id}`, image])) }));
    });
    return () => { active = false; };
  }, [code, state?.session, state?.phase, lastResult]);

  const chatMessages: ChatMessage[] = useMemo(() => messages.map(message => ({ id: message.id, text: message.text, author: state?.players[message.sender]?.username ?? 'Former player', isYou: message.sender === uid })), [messages, state?.players, uid]);
  const sendChat = async (text: string) => { try { await sendMessage(code, uid, text); } catch (failure) { throw new Error(roomError(failure)); } };

  if (!state) return <main className="room-page"><section className="room-card room-empty"><h1>Connecting to the match…</h1><p role="alert">{error || 'Waiting for the match server.'}</p><button className="room-secondary" onClick={onLeave}>Leave room</button></section></main>;

  const seconds = Math.max(0, Math.ceil((state.deadline - (now - offset)) / 1000));
  const entrants: Entrant[] = state.order.map((id, index) => ({ id: index, profile: state.players[id]!, isYou: id === uid }));
  const standings: Standing[] = entrants.map((entrant, index) => {
    const playerId = state.order[index]!;
    return { entrant, total: state.scores[playerId] ?? 0, added: lastResult?.entries[playerId]?.points ?? 0 };
  }).sort((a, b) => b.total - a.total || a.entrant.id - b.entrant.id);
  const result: RoundResult | null = lastResult ? {
    round: lastResult.round,
    prompt: lastResult.prompt,
    multiplier: state.doublePoints && lastResult.round === state.rounds ? 2 : 1,
    drawings: entrants.flatMap((entrant, index) => {
      const playerId = state.order[index]!;
      const entry = lastResult.entries[playerId];
      return entry?.submitted ? [{ entrant, points: entry.points, image: images[`${state.session}:${lastResult.round}:${playerId}`] || (playerId === uid ? ownImages[`${state.session}:${lastResult.round}`] : '') || loadingImage }] : [];
    }).sort((a, b) => b.points - a.points || a.entrant.id - b.entrant.id),
  } : null;
  const ownImage = ownImages[`${state.session}:${state.round}`];
  const submitted = state.submissions.includes(uid);
  const waiting = state.phase === 'drawing' && submitted;
  const busy = waiting || state.phase === 'judging';
  const title = state.phase === 'final' ? 'The final podium' : state.phase === 'leaderboard' ? 'Leaderboard' : state.phase === 'results' ? 'The results are in!' : waiting ? 'Drawing submitted!' : 'AI is judging…';

  if (state.phase === 'reveal' || (state.phase === 'drawing' && !submitted)) return <DrawingRound key={`${state.session}:${state.round}`} options={options} round={state.round} prompt={state.prompt} messages={chatMessages} onSend={sendChat} onBack={onLeave} onSubmit={() => { /* Live submissions use the server callback. */ }} live={{ revealing: state.phase === 'reveal', remaining: seconds, submitted, onDraft: image => matchRequest(`/rooms/${code}/draft`, { image }).then(() => undefined), onSubmit: async image => { await matchRequest(`/rooms/${code}/submit`, { image }); setOwnImages(current => ({ ...current, [`${state.session}:${state.round}`]: image })); } }}/>;

  return <main className="drawing-page match-page">
    <header className="drawing-heading"><button className="waiting-icon-button" aria-label="Leave match" onClick={() => leaveDialog.current?.showModal()}><ArrowLeft size={20}/></button><div className="drawing-prompt"><span>{state.phase === 'final' ? 'MATCH COMPLETE' : `ROUND ${state.round} / ${state.rounds}`} <b>LIVE MATCH</b>{state.round === state.rounds && state.doublePoints && state.phase !== 'final' && <b>2× POINTS</b>}</span><h1 ref={heading} tabIndex={-1}>{title}</h1></div><button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={21}/></button></header>
    <p className="drawing-preview-note">Real players and shared rounds. Judging is simulated, not real AI recognition.</p>
    {error && <p className="live-match-error" role="alert">{error}</p>}
    <div className="drawing-layout"><section className="match-main" aria-label={title}>
      <div className={`match-content${busy ? ' is-busy' : ''}`} ref={content}>
        {busy ? <div className="match-judging" role="status"><div className="match-judging-icon">{waiting ? <Check size={42}/> : <Sparkles size={42}/>}</div><h2>{waiting ? 'You’re all set.' : 'AI is judging…'}</h2><p>{waiting ? 'Waiting for the other artists.' : 'Finding this round’s stars.'}</p><div className="match-progress"><LoaderCircle size={18}/><span>{waiting ? `${state.submissions.length} / ${state.order.length} drawings submitted` : 'Simulated judging on the server'}</span></div>{ownImage && <img className="match-submitted-image" src={ownImage} alt="Your submitted drawing"/>}</div>
          : state.phase === 'results' && result ? result.drawings.length ? <RoundGallery result={result}/> : <div className="match-judging"><h2>No drawings this round</h2><p>Better luck next round!</p></div>
          : state.phase === 'leaderboard' ? <><div className="match-section-heading"><div><span>THE BIG PICTURE</span><h2>Who’s leading the pack?</h2><p>Total points after {state.round} {state.round === 1 ? 'round' : 'rounds'}.</p></div><Trophy size={34}/></div><Standings standings={standings}/></>
          : state.phase === 'final' ? <FinalPodium key={state.session} standings={standings}/> : null}
      </div>
      {(state.phase === 'leaderboard' || state.phase === 'results') && <div className="match-stage-countdown"><div><span>Up next: <strong>{state.phase === 'results' ? 'Leaderboard' : state.round === state.rounds ? 'Final podium' : 'Next round'}</strong></span><span className="match-stage-time" role="timer"><Clock3 size={18}/>{seconds}s</span></div><progress max={state.phase === 'results' ? 15 : 10} value={seconds} aria-label="Time remaining before the next section"/></div>}
      {state.phase === 'final' && <div className="match-actions"><button className="room-secondary" data-sound="close" onClick={onLeave}>Leave room</button>{isHost ? <button className="room-primary" disabled={rematchBusy || !state.rewardsComplete} onClick={() => { setRematchBusy(true); void matchRequest(`/rooms/${code}/rematch`, {}).then(() => { setImages({}); setOwnImages({}); }).catch(failure => setError(failure instanceof Error ? failure.message : 'Couldn’t start rematch.')).finally(() => setRematchBusy(false)); }}>{rematchBusy ? 'Starting…' : 'Play again'}<RotateCcw size={17}/></button> : <span>Waiting for the host to play again</span>}{!state.rewardsComplete && <span>Saving demo coins…</span>}</div>}
    </section><aside className="drawing-chat"><RoomChat live messages={chatMessages} onSend={sendChat}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</aside></div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Room chat"><RoomChat live messages={chatMessages} onSend={sendChat} onClose={() => chatDialog.current?.close()}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</dialog>
    <dialog ref={leaveDialog} className="waiting-player-dialog drawing-clear" aria-labelledby="leave-live-title"><h2 id="leave-live-title">Leave this match?</h2><p>You will leave the room, but the match keeps going for the others.</p><div><button className="room-secondary" onClick={() => leaveDialog.current?.close()}>Stay here</button><button className="room-primary" onClick={onLeave}>Leave room</button></div></dialog>
  </main>;
}
