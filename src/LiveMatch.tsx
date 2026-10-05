import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, MessageCircle, Send, Trophy } from 'lucide-react';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import { matchRequest, openMatchSocket, type MatchState } from './match-api';
import { AvatarPreview } from './AvatarPreview';
import { RoomChat, type ChatMessage } from './RoomChat';
import { roomError, sendMessage, watchMessages, type LiveMessage } from './rooms';
import './drawing-round.css';
import './live-match.css';

type Props = { code: string; uid: string; isHost: boolean; onLeave: () => void };
export function LiveMatch({ code, uid, isHost, onLeave }: Props) {
  const [state, setState] = useState<MatchState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const chatDialog = useRef<HTMLDialogElement>(null);
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
            if (message.type === 'match') { setOffset(Date.now() - message.match.serverNow); setState(message.match); setError(''); }
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
  useEffect(() => { if (state?.phase === 'final' && state.rewardsComplete) window.dispatchEvent(new Event('wallet-updated')); }, [state?.phase, state?.rewardsComplete]);
  const round = state?.phase === 'final' && selectedRound ? state.results[selectedRound - 1] : state?.results.at(-1);
  useEffect(() => {
    if (!state || !round || !['results', 'final'].includes(state.phase)) return;
    let active = true;
    const top = Object.keys(round.entries).sort((a, b) => round.entries[b]!.points - round.entries[a]!.points).slice(0, 3);
    const ids = [...new Set([uid, ...top])];
    void Promise.all(ids.map(async id => {
      try {
        const result = await matchRequest<{ image: string }>(`/rooms/${code}/drawing/${round.round}/${id}`);
        if (active && result.image) setImages(current => ({ ...current, [`${state.session}:${round.round}:${id}`]: result.image }));
      } catch { /* A missing submission has no image. */ }
    }));
    return () => { active = false; };
  }, [code, uid, round, state?.phase, state?.session]);

  if (!state) return <main className="room-page"><section className="room-card room-empty"><h1>Connecting to the match…</h1><p role="alert">{error || 'Waiting for the match server.'}</p><button className="room-secondary" onClick={onLeave}>Leave room</button></section></main>;
  const seconds = Math.max(0, Math.ceil((state.deadline - (now - offset)) / 1000));
  const ranking = [...state.order].sort((a, b) => state.scores[b]! - state.scores[a]! || state.order.indexOf(a) - state.order.indexOf(b));
  const own = round?.entries[uid];
  const chatMessages: ChatMessage[] = messages.map(message => ({ id: message.id, text: message.text, author: state.players[message.sender]?.username ?? 'Former player', isYou: message.sender === uid }));
  const sendChat = async (text: string) => { try { await sendMessage(code, uid, text); } catch (failure) { throw new Error(roomError(failure)); } };
  return <main className="drawing-page live-match">
    <header className="drawing-heading"><button className="waiting-icon-button" aria-label="Leave match" onClick={() => { if (window.confirm('Leave this match?')) onLeave(); }}><ArrowLeft size={20}/></button><div className="drawing-prompt"><span>ROUND {state.round} / {state.rounds} <b>LIVE MATCH</b>{state.round === state.rounds && state.doublePoints && <b>2× POINTS</b>}</span><h1>{state.phase === 'final' ? 'Final podium' : state.phase === 'results' ? 'Round results' : state.phase === 'judging' ? 'Judging drawings…' : `Draw a ${state.prompt}`}</h1></div>{state.phase !== 'final' && <div className="drawing-clock" role="timer" aria-label={`${seconds} seconds remaining`}><Clock3 size={21}/><strong>{seconds}s</strong></div>}<button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={21}/></button></header>
    <p className="drawing-preview-note">Mock judging on the server: points and predictions are simulated, not AI recognition. The round timer and results are shared by everyone.</p>
    {error && <p className="live-match-error" role="alert">{error}</p>}
    {state.phase === 'final' && isHost && <button className="room-primary live-match-rematch" disabled={rematchBusy || !state.rewardsComplete} onClick={() => { setRematchBusy(true); void matchRequest(`/rooms/${code}/rematch`, {}).then(() => { setSelectedRound(null); setImages({}); }).catch(failure => setError(failure instanceof Error ? failure.message : 'Couldn’t start rematch.')).finally(() => setRematchBusy(false)); }}>{rematchBusy ? 'Starting…' : 'Play again'}</button>}
    {state.phase === 'final' && !isHost && <p className="drawing-preview-note">Waiting for the host to start another match.</p>}
    {state.phase === 'reveal' ? <section className="live-match-center"><p>Get ready to draw</p><h2>{state.prompt}</h2><strong>{seconds}</strong></section>
      : state.phase === 'drawing' ? <LiveDrawing key={`${state.session}:${state.round}`} code={code} submitted={state.submissions.includes(uid)} remaining={seconds} messages={chatMessages} onSend={sendChat}/>
      : state.phase === 'judging' ? <section className="live-match-center" role="status"><h2>Checking the doodles…</h2><p>Demo judging is running on the match server.</p></section>
      : <div className="live-match-results"><section className="live-match-result-card"><h2>{state.phase === 'final' ? 'You did it!' : `Round ${round?.round} · ${round?.prompt}`}</h2>{state.phase === 'final' && <div className="live-match-rounds" aria-label="View round drawings">{state.results.map(result => <button key={result.round} aria-pressed={round?.round === result.round} onClick={() => setSelectedRound(result.round)}>Round {result.round}</button>)}</div>}{round && <><p>Round {round.round}: <strong>{own?.submitted ? `${own.points.toLocaleString()} points` : 'No submission'}</strong></p>{images[`${state.session}:${round.round}:${uid}`] && <img src={images[`${state.session}:${round.round}:${uid}`]} alt="Your submitted drawing"/>}<h3>Top drawings</h3><div className="live-match-gallery">{Object.keys(round.entries).filter(id => round.entries[id]!.submitted).sort((a, b) => round.entries[b]!.points - round.entries[a]!.points).slice(0, 3).map((id, index) => <article key={id}><strong>#{index + 1} {state.players[id]?.username}</strong>{images[`${state.session}:${round.round}:${id}`] ? <img src={images[`${state.session}:${round.round}:${id}`]} alt={`${state.players[id]?.username}'s drawing`}/> : <span>Loading drawing…</span>}<small>{round.entries[id]!.points.toLocaleString()} pts</small></article>)}</div></>}{state.phase === 'final' && <p>Coins earned: <strong>{state.awards[uid] ?? 0}</strong>{state.rewardsComplete ? ' · saved to your wallet' : ' · saving…'}</p>}</section><section className="live-match-standings"><h2><Trophy size={21}/> {state.phase === 'final' ? 'Final standings' : 'Leaderboard'}</h2>{ranking.map((id, index) => <div key={id} className="live-match-player"><span>#{index + 1}</span><AvatarPreview avatar={state.players[id]!.avatar}/><strong>{state.players[id]!.username}{id === uid ? ' · you' : ''}</strong><span>{state.scores[id]!.toLocaleString()} pts</span></div>)}</section></div>}
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Room chat"><RoomChat live messages={chatMessages} onSend={sendChat} onClose={() => chatDialog.current?.close()}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</dialog>
  </main>;
}

function LiveDrawing({ code, submitted, remaining, messages, onSend }: { code: string; submitted: boolean; remaining: number; messages: ChatMessage[]; onSend: (text: string) => Promise<void> }) {
  const canvas = useRef<DrawingCanvasHandle>(null);
  const savedDraft = useRef(false);
  const draftBusy = useRef(false);
  const finalBusy = useRef(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  async function saveDraft() {
    if (submitted || remaining <= 0 || draftBusy.current || !canvas.current) return;
    const image = canvas.current.hasDrawing() ? canvas.current.snapshot('jpeg') : null;
    if (!image && !savedDraft.current) return;
    draftBusy.current = true;
    try { await matchRequest(`/rooms/${code}/draft`, { image }); if (image) savedDraft.current = true; }
    catch { /* Retry on the next interval. */ }
    finally { draftBusy.current = false; }
  }
  async function submitDrawing() {
    if (submitted || finalBusy.current || !canvas.current?.hasDrawing() || remaining <= 0) return;
    finalBusy.current = true;
    setSending(true);
    try {
      await matchRequest(`/rooms/${code}/submit`, { image: canvas.current.snapshot('jpeg') });
      setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Couldn’t submit. Try again.'); }
    finally { finalBusy.current = false; setSending(false); }
  }
  useEffect(() => {
    if (submitted) return;
    const timer = window.setInterval(() => void saveDraft(), 4000);
    return () => window.clearInterval(timer);
  }, [submitted, code, remaining <= 0]);
  useEffect(() => { if (remaining <= 2 && remaining > 0 && !submitted) void submitDrawing(); }, [remaining, submitted]);
  return <div className="drawing-layout"><section className="drawing-workspace"><div className="drawing-editor"><DrawingCanvas ref={canvas} locked={submitted || sending || remaining <= 0} onEmpty={() => { if (savedDraft.current) void matchRequest(`/rooms/${code}/draft`, { image: null }).catch(() => { /* The interval retries. */ }); }}/></div><div className="drawing-actions"><div role="status">{submitted ? 'Drawing submitted. Waiting for the others.' : error || 'Your drawing stays private until results.'}</div><button className="room-primary" disabled={submitted || sending || remaining <= 0} onClick={() => void submitDrawing()}>{sending ? 'Sending…' : submitted ? 'Submitted' : 'Submit'}<Send size={17}/></button></div></section><aside className="drawing-chat"><RoomChat live messages={messages} onSend={onSend}/></aside></div>;
}
