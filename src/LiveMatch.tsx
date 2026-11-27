import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, LoaderCircle, MessageCircle, Share2, Sparkles, Trophy } from 'lucide-react';
import { ATTACK_LABELS, DrawingRound, EVENT_LABELS } from './DrawingRound';
import { RoomChat, useUnreadChat, type ChatMessage } from './RoomChat';
import { FinalPodium, RoundGallery, Standings } from './MatchResults';
import { roomError, sendMessage, watchMessages, type LiveMessage, type RoomOptions } from './rooms';
import { matchRequest, openMatchSocket, type AttackType, type MatchState, type RoundEvent } from './match-api';
import type { Entrant, RoundResult, Standing } from './preview-match';
import { useAudioScene } from './useAudio';
import './match-results.css';
import './live-match.css';

const loadingImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#fff"/><text x="400" y="250" text-anchor="middle" fill="#58777c" font-family="sans-serif" font-size="26">Loading drawing…</text></svg>');
const blankImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#fff"/></svg>');
type Props = { code: string; uid: string; isHost?: boolean; hostInLobby?: boolean; roomClosed: boolean; options: RoomOptions; onLeave: () => void; onFinish: () => void; onRematch: () => Promise<void> };

export function LiveMatch({ code, uid, isHost = false, hostInLobby = false, roomClosed, options, onLeave, onFinish, onRematch }: Props) {
  const [state, setState] = useState<MatchState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [ownImages, setOwnImages] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const [rematching, setRematching] = useState(false);
  const [shared, setShared] = useState(false);
  const chatDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useAudioScene(state?.phase === 'results' ? 'showcase' : state?.phase === 'final' ? 'podium' : state?.phase === 'judging' ? 'judging' : state?.phase === 'leaderboard' ? 'leaderboard' : state?.phase === 'drawing' && state.submissions.includes(uid) ? 'judging' : state?.phase === 'drawing' || state?.phase === 'reveal' ? 'drawing' : null, 2);

  useEffect(() => watchMessages(code, setMessages, setChatError), [code]);
  useEffect(() => {
    if (state?.phase === 'results' || state?.phase === 'leaderboard') {
      let frame = 0;
      const tick = () => {
        setNow(Date.now());
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frame);
    }
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [state?.phase]);
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

  const chatMessages: ChatMessage[] = useMemo(() => {
    type TimedMessage = { at: number; order: number; msg: ChatMessage };
    const items: TimedMessage[] = messages.map((message, idx) => ({
      at: message.createdAt ?? idx,
      order: idx,
      msg: { id: message.id, text: message.text, author: state?.players[message.sender]?.username ?? 'Former player', isYou: message.sender === uid, senderId: message.sender },
    }));
    const offset = messages.length;
    (state?.eventLog ?? []).forEach((item, idx) => {
      const fromName = state?.players[item.from]?.username ?? 'Someone';
      const at = item.at ?? Number.MAX_SAFE_INTEGER;
      if (item.kind === 'sabotage') {
        const [atk, rawTargets = ''] = item.detail.split(':');
        const targetNames = rawTargets.split(',').filter(Boolean).map(id => state?.players[id]?.username ?? 'Player').join(', ');
        items.push({ at, order: offset + idx, msg: { id: `event-${item.round}-${idx}`, author: `⚡ Event · R${item.round}`, text: `${fromName} sabotaged ${targetNames} (${ATTACK_LABELS[atk as AttackType] ?? atk})!`, sample: true } });
      } else {
        const ev = EVENT_LABELS[item.detail as Exclude<RoundEvent, 'normal'>];
        items.push({ at, order: offset + idx, msg: { id: `event-${item.round}-${idx}`, author: `⚡ Event · R${item.round}`, text: `${fromName} activated ${ev?.badge ?? item.detail}${ev?.hint ? ` - ${ev.hint}` : '!'}`, sample: true } });
      }
    });
    if (state && state.round > 0) {
      if (state.roundEvent && state.roundEvent !== 'normal' && !(state.eventLog ?? []).some(item => item.round === state.round && item.kind === 'round_chaos' && item.detail === state.roundEvent)) {
        const ev = EVENT_LABELS[state.roundEvent];
        items.push({ at: Number.MAX_SAFE_INTEGER, order: offset + 1000, msg: { id: `round-event-${state.session}-${state.round}`, author: `⚡ Event · R${state.round}`, text: `${ev.badge} - ${ev.hint}`, sample: true } });
      }
      if (state.round === state.rounds && state.doublePoints && state.roundEvent !== 'double_points') {
        items.push({ at: Number.MAX_SAFE_INTEGER, order: offset + 1001, msg: { id: `finale-2x-${state.session}-${state.round}`, author: `⚡ Event · R${state.round}`, text: '💎 2× POINTS FINALE - Double points & +50% drawing time for the final round!', sample: true } });
      }
    }
    return items.sort((a, b) => a.at - b.at || a.order - b.order).map(item => item.msg);
  }, [messages, state?.players, state?.eventLog, state?.round, state?.rounds, state?.doublePoints, state?.roundEvent, state?.session, uid]);
  const { unread, openChat, closeChat, onDialogClose } = useUnreadChat(chatMessages, chatDialog);
  const sendChat = async (text: string) => { try { await sendMessage(code, uid, text); } catch (failure) { throw new Error(roomError(failure)); } };

  if (roomClosed && state?.phase !== 'final') return <main className="room-page"><section className="room-card room-empty"><h1>Room closed</h1><p>This match has ended.</p><button className="room-primary" onClick={onFinish}>Back to lobby</button></section></main>;
  if (!state) return <main className="room-page"><section className="room-card room-empty"><h1>Connecting to the match…</h1><p role="alert">{error || 'Waiting for the match server.'}</p><button className="room-secondary" onClick={onLeave}>Leave room</button></section></main>;

  const remainingSeconds = Math.max(0, (state.deadline - (now - offset)) / 1000);
  const seconds = Math.ceil(remainingSeconds);
  const entrants: Entrant[] = state.order.map((id, index) => ({ id: index, profile: state.players[id]!, isYou: id === uid }));
  const standings: Standing[] = entrants.map((entrant, index) => {
    const playerId = state.order[index]!;
    return { entrant, total: state.scores[playerId] ?? 0, added: lastResult?.entries[playerId]?.points ?? 0 };
  }).sort((a, b) => b.total - a.total || a.entrant.id - b.entrant.id);
  const result: RoundResult | null = lastResult ? {
    round: lastResult.round,
    prompt: lastResult.prompt,
    multiplier: state.doublePoints && lastResult.round === state.rounds ? 2 : 1,
    drawings: entrants.map((entrant, index) => {
      const playerId = state.order[index]!;
      const entry = lastResult.entries[playerId];
      const submittedDrawing = Boolean(entry?.submitted);
      return {
        entrant,
        points: entry?.points ?? 0,
        prediction: state.judgingMode === 'model' ? (entry?.prediction ?? 'No drawing') : undefined,
        confidence: entry?.confidence ?? 0,
        image: submittedDrawing
          ? images[`${state.session}:${lastResult.round}:${playerId}`] || (playerId === uid ? ownImages[`${state.session}:${lastResult.round}`] : '') || loadingImage
          : blankImage,
      };
    }).sort((a, b) => b.points - a.points || a.entrant.id - b.entrant.id),
  } : null;
  const ownImage = ownImages[`${state.session}:${state.round}`];
  const submitted = state.submissions.includes(uid);
  const waiting = state.phase === 'drawing' && submitted;
  const busy = waiting || state.phase === 'judging';
  const title = state.phase === 'final' ? 'The final podium' : state.phase === 'leaderboard' ? 'Leaderboard' : state.phase === 'results' ? 'The results are in!' : waiting ? 'Drawing submitted!' : 'Calculating scores…';

  const activeCurse = state.myAttack ?? null;
  const cursedBy = activeCurse ? { type: activeCurse.type, attackerName: state.players[activeCurse.from]?.username ?? 'Someone' } : null;
  const announcements = (state.eventLog ?? []).filter(item => item.round === state.round).map((item, idx) => {
    const fromName = state.players[item.from]?.username ?? 'Someone';
    if (item.kind === 'sabotage') {
      const [atk, rawTargets = ''] = item.detail.split(':');
      const targetIds = rawTargets.split(',').filter(Boolean);
      const targetNames = targetIds.map(id => state.players[id]?.username ?? 'Player').join(', ');
      const isYouTarget = targetIds.includes(uid);
      return {
        key: `${state.round}:${idx}`,
        kind: 'sabotage' as const,
        isYouTarget,
        text: isYouTarget ? `You were sabotaged by ${fromName}! (${ATTACK_LABELS[atk as AttackType] ?? atk})` : `${fromName} sabotaged ${targetNames}! (${ATTACK_LABELS[atk as AttackType] ?? atk})`,
      };
    }
    return {
      key: `${state.round}:${idx}`,
      kind: 'round_chaos' as const,
      isYouTarget: false,
      text: `${fromName} activated ${EVENT_LABELS[item.detail as Exclude<RoundEvent, 'normal'>]?.badge ?? item.detail}!`,
    };
  });

  if (state.phase === 'reveal' || (state.phase === 'drawing' && !submitted)) return <DrawingRound key={`${state.session}:${state.round}`} options={options} round={state.round} prompt={state.prompt} messages={chatMessages} onSend={sendChat} onBack={onLeave} onSubmit={() => { /* Live rounds auto-judge at the deadline. */ }} live={{ revealing: state.phase === 'reveal', remaining: seconds, submitted, judgingMode: state.judgingMode, roundEvent: state.roundEvent, cursedBy, eventOffer: state.myEventOffer, announcements, reactions: options.reactions ? { code, uid, players: state.players } : undefined, onEventChoice: payload => matchRequest(`/rooms/${code}/event`, payload).then(() => undefined), onDraft: async image => { const res = await matchRequest<{ saved: boolean; prediction?: { class: string; confidence: number; targetConfidence: number; points: number } | null }>(`/rooms/${code}/draft`, { image }); if (image) setOwnImages(current => ({ ...current, [`${state.session}:${state.round}`]: image })); return res.prediction ?? null; }, onSubmit: async image => { await matchRequest(`/rooms/${code}/submit`, { image }); setOwnImages(current => ({ ...current, [`${state.session}:${state.round}`]: image })); } }}/>;

  return <main className="drawing-page match-page">
    <header className="drawing-heading"><button className="waiting-icon-button" aria-label="Leave match" onClick={() => leaveDialog.current?.showModal()}><ArrowLeft size={20}/></button><div className="drawing-prompt"><span>{state.phase === 'final' ? 'MATCH COMPLETE' : `ROUND ${state.round} / ${state.rounds}`}{state.round === state.rounds && state.doublePoints && state.phase !== 'final' && <b>2× POINTS</b>}</span><h1 ref={heading} tabIndex={-1}>{title}</h1></div><button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={openChat}><MessageCircle size={21}/>{unread > 0 && <span className="chat-unread-badge" aria-label={`${unread} unread messages`}>{unread > 9 ? '9+' : unread}</span>}</button></header>
    {error && <p className="live-match-error" role="alert">{error}</p>}
    <div className="drawing-layout"><section className="match-main" aria-label={title}>
      <div className={`match-content${busy ? ' is-busy' : ''}`} ref={content}>
        {busy ? <div className="match-judging" role="status"><div className="match-judging-icon">{waiting ? <Check size={42}/> : <Sparkles size={42}/>}</div><h2>{waiting ? 'You’re all set.' : 'Calculating scores…'}</h2><p>{waiting ? 'Waiting for the other artists.' : 'Tallying points and rankings.'}</p><div className="match-progress"><LoaderCircle size={18}/><span>{waiting ? `${state.submissions.length} / ${state.order.length} drawings submitted` : 'Finalizing round results'}</span></div>{ownImage && <img className="match-submitted-image" src={ownImage} alt="Your submitted drawing"/>}</div>
          : state.phase === 'results' && result ? result.drawings.length ? <RoundGallery result={result}/> : <div className="match-judging"><h2>No drawings this round</h2><p>Better luck next round!</p></div>
          : state.phase === 'leaderboard' ? <><div className="match-section-heading"><div><span>THE BIG PICTURE</span><h2>Who’s leading the pack?</h2><p>Total points after {state.round} {state.round === 1 ? 'round' : 'rounds'}.</p></div><Trophy size={34}/></div><Standings standings={standings}/></>
          : state.phase === 'final' ? <FinalPodium key={state.session} standings={standings}/> : null}
      </div>
      {(state.phase === 'leaderboard' || state.phase === 'results') && <div className="match-stage-countdown"><div><span>Up next: <strong>{state.phase === 'results' ? (state.round === state.rounds ? 'Final podium' : 'Leaderboard') : state.round === state.rounds ? 'Final podium' : 'Next round'}</strong></span><span className="match-stage-time" role="timer"><Clock3 size={18}/>{seconds}s</span></div><progress max={state.phase === 'results' ? 15 : 10} value={remainingSeconds} aria-label="Time remaining before the next section"/></div>}
      {state.phase === 'final' && (
        <div className="match-actions">
          <div className="match-action-buttons">
            <button className={!roomClosed ? 'room-secondary' : 'room-primary'} data-sound="close" onClick={isHost ? onFinish : onLeave}>Leave room</button>
            {!roomClosed && (
              <button className="room-primary" disabled={rematching || (!isHost && !hostInLobby)} onClick={() => {
                setRematching(true);
                const action = isHost ? matchRequest(`/rooms/${code}/rematch`, {}).then(() => onRematch()) : onRematch();
                void action.catch(() => undefined).finally(() => setRematching(false));
              }}>
                {rematching ? 'Returning…' : 'Play Again'}
              </button>
            )}
            <button type="button" className="room-secondary" onClick={() => {
              const top = standings.slice(0, 3).map((row, idx) => `${['🥇', '🥈', '🥉'][idx]} ${row.entrant.profile.username} (${row.total.toLocaleString()} pts)`).join(' · ');
              const meIndex = standings.findIndex(row => row.entrant.isYou);
              const me = meIndex >= 0 ? ` | My rank: #${meIndex + 1} (${standings[meIndex]!.total.toLocaleString()} pts)` : '';
              void navigator.clipboard.writeText(`Draw It Right! Final Results: ${top}${me}`).then(() => { setShared(true); window.setTimeout(() => setShared(false), 2200); }).catch(() => undefined);
            }}><Share2 size={16}/>{shared ? 'Copied!' : 'Share Result'}</button>
          </div>
          <span>{roomClosed ? 'Match complete · room closed' : isHost ? 'Play again with the same crew or leave' : hostInLobby ? 'Host is in the room! Click Play Again to join.' : 'Waiting for host to join the room first…'}</span>
        </div>
      )}
    </section><aside className="drawing-chat"><RoomChat live messages={chatMessages} onSend={sendChat}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</aside></div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Room chat" onClose={onDialogClose}><RoomChat live messages={chatMessages} onSend={sendChat} onClose={closeChat}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</dialog>
    <dialog ref={leaveDialog} className="waiting-player-dialog drawing-clear" aria-labelledby="leave-live-title"><h2 id="leave-live-title">Leave this match?</h2><p>You will leave the room, but the match keeps going for the others.</p><div><button className="room-secondary" onClick={() => leaveDialog.current?.close()}>Stay here</button><button className="room-primary" onClick={onLeave}>Leave room</button></div></dialog>
  </main>;
}
