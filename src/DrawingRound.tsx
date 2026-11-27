import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, MessageCircle, Sparkles } from 'lucide-react';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import type { AttackType, EventOfferKind, RoundEvent } from './match-api';
import { RoomChat, useUnreadChat, type ChatMessage } from './RoomChat';
import type { RoomOptions } from './RoomPages';
import './drawing-round.css';
import { gameAudio } from './audio';

export const EVENT_LABELS: Record<Exclude<RoundEvent, 'normal'>, { badge: string; hint: string }> = {
  speed_blitz: { badge: '⚡ SPEED BLITZ', hint: 'Short timer, 2× speed bonus!' },
  double_points: { badge: '💎 2× POINTS', hint: 'Double points for everyone this round!' },
  no_undo: { badge: '🚫 NO UNDO', hint: 'Eraser, Undo & Clear are locked!' },
  fat_brush: { badge: '🖌️ FAT BRUSH', hint: 'Large brush only!' },
  precision: { badge: '🎯 PRECISION +400', hint: '+400 pts if AI confidence >= 85%!' },
  upside_down: { badge: '🙃 UPSIDE DOWN ALL', hint: 'Everyone draws upside down!' },
  shake: { badge: '🌋 EARTHQUAKE ALL', hint: 'Everyone’s canvas shakes!' },
  tiny_brush: { badge: '🤏 MICRO PEN ALL', hint: 'Tiny 2px brush only for everyone!' },
  ghost_ink: { badge: '👻 GHOST INK ALL', hint: 'Everyone’s canvas fades in and out!' },
  mirror_x: { badge: '🪞 MIRROR CHAOS', hint: 'Everyone’s canvas is mirrored!' },
};

export const ATTACK_LABELS: Record<AttackType, string> = {
  upside_down: '🙃 Upside Down',
  shake: '🌋 Earthquake',
  no_undo: '🚫 No Undo',
  tiny_brush: '🤏 Micro Pen',
  ghost_ink: '👻 Ghost Ink',
  mirror_x: '🪞 Mirror Mode',
};

const ATTACK_CARD_HINTS: Record<AttackType, string> = {
  upside_down: 'Flips their canvas 180°!',
  shake: 'Shakes their canvas while drawing!',
  no_undo: 'Locks their Eraser, Undo & Clear!',
  tiny_brush: 'Forces a tiny 2px needle pen!',
  ghost_ink: 'Makes their canvas fade like a ghost!',
  mirror_x: 'Mirrors their canvas left-to-right!',
};

export type LivePrediction = { class: string; confidence: number; targetConfidence: number; points: number };
type EventChoicePayload = { kind: 'sabotage'; attack: AttackType } | { kind: 'round_chaos'; roundEvent: Exclude<RoundEvent, 'normal'> };
type EventAnnouncementBanner = { key: string; kind: 'sabotage' | 'round_chaos'; isYouTarget: boolean; text: string };
type LiveRound = {
  revealing: boolean; remaining: number; submitted: boolean; judgingMode?: 'model';
  roundEvent?: RoundEvent; cursedBy?: { type: AttackType; attackerName: string } | null;
  eventOffer?: EventOfferKind | null; announcements?: EventAnnouncementBanner[];
  onEventChoice?: (payload: EventChoicePayload) => Promise<void>;
  onSubmit: (image: string) => Promise<void>; onDraft: (image: string | null) => Promise<LivePrediction | null | void>;
};
type Props = { options: RoomOptions; round: number; prompt: string; messages: ChatMessage[]; onSend: (text: string) => void | Promise<void>; onBack: () => void; onSubmit: (image: string, early: boolean) => void; live?: LiveRound };
export function DrawingRound({ options, round, prompt, messages, onSend, onBack, onSubmit, live }: Props) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const sent = useRef(false);
  const savedDraft = useRef(false);
  const draftBusy = useRef(false);
  const strokeDebounce = useRef<number | undefined>(undefined);
  const [livePrediction, setLivePrediction] = useState<LivePrediction | null>(null);
  const [eventDismissed, setEventDismissed] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [eventMode, setEventMode] = useState<'personal' | 'all' | null>(null);
  const [personalAttackChoices] = useState<AttackType[]>(() => {
    const pool: AttackType[] = ['upside_down', 'shake', 'no_undo', 'tiny_brush', 'ghost_ink', 'mirror_x'];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 3);
  });
  const [allTwistChoices] = useState<Exclude<RoundEvent, 'normal'>[]>(() => {
    const pool: Exclude<RoundEvent, 'normal'>[] = ['upside_down', 'shake', 'tiny_brush', 'ghost_ink', 'mirror_x', 'double_points', 'precision', 'fat_brush', 'no_undo'];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 3);
  });
  const [banner, setBanner] = useState<EventAnnouncementBanner | null>(null);
  const seenAnnouncements = useRef(0);
  const liveRef = useRef(live);
  liveRef.current = live;
  const canvas = useRef<DrawingCanvasHandle>(null);
  const chatDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const { unread, openChat, closeChat, onDialogClose } = useUnreadChat(messages, chatDialog);
  const revealEnd = startedAt + 3000;
  const drawingEnd = revealEnd + options.timer * 1000;
  const revealing = live ? live.revealing : now < revealEnd;
  const expired = live ? live.remaining <= 0 || live.submitted : now >= drawingEnd;
  const remaining = live ? live.remaining : Math.max(0, Math.ceil((drawingEnd - now) / 1000));
  const countdown = live ? live.remaining : Math.max(1, Math.ceil((revealEnd - now) / 1000));

  useEffect(() => {
    if (liveRef.current) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (revealing || (remaining > 0 && remaining <= 5)) gameAudio.play('tick');
  }, [revealing, revealing ? countdown : remaining]);
  useEffect(() => {
    if (live || !expired || sent.current) return;
    sent.current = true;
    gameAudio.play('submit');
    onSubmit(canvas.current?.snapshot() ?? '', false);
  }, [expired, onSubmit]);

  async function saveDraft() {
    const current = liveRef.current;
    if (!current || current.revealing || current.submitted || current.remaining <= 0 || draftBusy.current || !canvas.current) return;
    const image = canvas.current.hasDrawing() ? canvas.current.snapshot('jpeg') : null;
    if (!image && !savedDraft.current) return;
    draftBusy.current = true;
    try {
      const prediction = await current.onDraft(image);
      if (image) {
        savedDraft.current = true;
        if (prediction) setLivePrediction(prediction);
      } else {
        setLivePrediction(null);
      }
    }
    catch { /* Retry on the next interval. */ }
    finally { draftBusy.current = false; }
  }
  useEffect(() => {
    if (!live || live.submitted) return;
    const timer = window.setInterval(() => void saveDraft(), 1500);
    return () => {
      window.clearInterval(timer);
      if (strokeDebounce.current) window.clearTimeout(strokeDebounce.current);
    };
  }, [Boolean(live), live?.submitted]);

  function scheduleStrokeCheck() {
    if (!liveRef.current || revealing || expired) return;
    if (strokeDebounce.current) window.clearTimeout(strokeDebounce.current);
    strokeDebounce.current = window.setTimeout(() => void saveDraft(), 300);
  }

  const matched = Boolean(livePrediction && livePrediction.class.toLowerCase() === prompt.toLowerCase());
  const roundEvent = live?.roundEvent && live.roundEvent !== 'normal' ? live.roundEvent : null;
  const curse = live?.cursedBy ?? null;
  const noUndo = roundEvent === 'no_undo' || curse?.type === 'no_undo';
  const forceSize = roundEvent === 'fat_brush' ? 16 : (roundEvent === 'tiny_brush' || curse?.type === 'tiny_brush') ? 2 : undefined;
  const isFlipped = roundEvent === 'upside_down' || curse?.type === 'upside_down';
  const isShaking = roundEvent === 'shake' || curse?.type === 'shake';
  const isMirrored = roundEvent === 'mirror_x' || curse?.type === 'mirror_x';
  const isGhost = roundEvent === 'ghost_ink' || curse?.type === 'ghost_ink';
  const canvasClassName = isFlipped ? 'is-flipped' : isShaking ? 'is-shaking' : isMirrored ? 'is-mirrored' : isGhost ? 'is-ghost' : undefined;
  const showEventCards = Boolean(live?.eventOffer && !revealing && !expired && !eventDismissed);

  useEffect(() => {
    if (showEventCards) gameAudio.play('event-offer');
  }, [showEventCards]);

  useEffect(() => {
    const list = live?.announcements ?? [];
    if (list.length <= seenAnnouncements.current) return;
    const latest = list[list.length - 1]!;
    seenAnnouncements.current = list.length;
    gameAudio.play(latest.kind === 'sabotage' ? 'event-sabotage' : 'event-twist');
    setBanner(latest);
    const timer = window.setTimeout(() => setBanner(null), latest.isYouTarget ? 3400 : 2600);
    return () => window.clearTimeout(timer);
  }, [live?.announcements?.length]);

  async function chooseEvent(payload: EventChoicePayload) {
    if (!live?.onEventChoice || eventBusy) return;
    setEventBusy(true);
    try { await live.onEventChoice(payload); setEventDismissed(true); }
    catch { setEventDismissed(true); }
    finally { setEventBusy(false); }
  }

  return <main className="drawing-page">
    <header className="drawing-heading">
      <button className="waiting-icon-button" aria-label="Back to waiting room" onClick={() => leaveDialog.current?.showModal()}><ArrowLeft size={20}/></button>
      <div className="drawing-prompt"><span>ROUND {round} / {options.rounds}{!live && <b>PREVIEW</b>}{round === options.rounds && options.doublePoints && <b>2× POINTS</b>}{roundEvent && <b className="is-event">{EVENT_LABELS[roundEvent].badge}</b>}</span><h1>Draw <strong>a {prompt}</strong></h1></div>
      <div className={`drawing-clock${!revealing && remaining <= 10 ? ' is-urgent' : ''}`} aria-label={revealing ? 'Get ready' : `${remaining} seconds remaining`}><Clock3 size={21}/><strong>{revealing ? `${options.timer}s` : `${remaining}s`}</strong></div>
      <button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={openChat}><MessageCircle size={21}/>{unread > 0 && <span className="chat-unread-badge" aria-label={`${unread} unread messages`}>{unread > 9 ? '9+' : unread}</span>}</button>
    </header>
    {!live && <p className="drawing-preview-note">Local preview. Sample results, not real AI scores.</p>}
    <div className="drawing-layout">
      <section className="drawing-workspace" aria-label="Your drawing">
        {live && (
          <div className="drawing-live-bar" role="status">
            {revealing ? '' : livePrediction ? (
              <span className={`drawing-live-ai${matched ? ' is-match' : ''}`}>
                <Sparkles size={14}/> <strong>{livePrediction.class}</strong> · {Math.round(livePrediction.confidence * 100)}% · {livePrediction.points.toLocaleString()} pts
              </span>
            ) : <span className="drawing-live-ai">AI: waiting…</span>}
            {!revealing && curse && <span className="drawing-curse-pill">{ATTACK_LABELS[curse.type]} by {curse.attackerName}</span>}
          </div>
        )}
        <div className="drawing-editor" onPointerUp={scheduleStrokeCheck}>
          <DrawingCanvas ref={canvas} locked={revealing || expired || showEventCards} noUndo={noUndo} forceSize={forceSize} canvasClassName={canvasClassName} flipped={isFlipped} shaking={isShaking} mirrored={isMirrored} ghost={isGhost} onEmpty={live ? () => { setLivePrediction(null); if (savedDraft.current) void live.onDraft(null).catch(() => { /* The interval retries. */ }); } : undefined}/>
          {banner && !revealing && (
            <div className={`drawing-center-banner${banner.isYouTarget ? ' is-victim' : banner.kind === 'sabotage' ? ' is-sabotage' : ' is-twist'}`} role="status">
              <strong>{banner.text}</strong>
            </div>
          )}
          {revealing && <div className="drawing-reveal"><h2>Draw a<strong>{prompt}</strong></h2><strong className="drawing-countdown" key={countdown}>{countdown}</strong>{roundEvent && <p className="drawing-reveal-event"><strong>{EVENT_LABELS[roundEvent].badge}</strong><span>{EVENT_LABELS[roundEvent].hint}</span></p>}{curse && <p className="drawing-reveal-curse">{ATTACK_LABELS[curse.type]} from <strong>{curse.attackerName}</strong>!</p>}</div>}
          {showEventCards && (
            <div className="drawing-event-overlay" role="dialog" aria-label="Secret event card">
              <div className="drawing-event-head">
                <span>SECRET EVENT</span>
                <h3>{eventMode === 'personal' ? 'Pick a Curse (Hits 40% Random Players)!' : eventMode === 'all' ? 'Pick an Effect for Everyone!' : 'Choose Event Scope!'}</h3>
              </div>
              {!eventMode ? (
                <div className="drawing-event-cards">
                  <button type="button" className="drawing-event-card" disabled={eventBusy} onClick={() => setEventMode('personal')}>
                    <strong>🎯 Random Sabotage</strong>
                    <span>Curse 40% of players at random!</span>
                  </button>
                  <button type="button" className="drawing-event-card" disabled={eventBusy} onClick={() => setEventMode('all')}>
                    <strong>🌍 Hit Everyone</strong>
                    <span>Apply a chaos twist to the whole room!</span>
                  </button>
                </div>
              ) : eventMode === 'personal' ? (
                <div className="drawing-event-cards">
                  {personalAttackChoices.map(type => (
                    <button key={type} type="button" className="drawing-event-card" disabled={eventBusy} onClick={() => void chooseEvent({ kind: 'sabotage', attack: type })}>
                      <strong>{ATTACK_LABELS[type]}</strong>
                      <span>{ATTACK_CARD_HINTS[type]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="drawing-event-cards">
                  {allTwistChoices.map(ev => (
                    <button key={ev} type="button" className="drawing-event-card" disabled={eventBusy} onClick={() => void chooseEvent({ kind: 'round_chaos', roundEvent: ev })}>
                      <strong>{EVENT_LABELS[ev].badge}</strong>
                      <span>{EVENT_LABELS[ev].hint}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="drawing-event-targets">
                {eventMode && <button type="button" className="drawing-event-skip" disabled={eventBusy} onClick={() => setEventMode(null)}>Back</button>}
                <button type="button" className="drawing-event-skip" disabled={eventBusy} onClick={() => setEventDismissed(true)}>Skip</button>
              </div>
            </div>
          )}
        </div>
        <div className="drawing-actions">
          <div role="status">{!live && !revealing ? 'Draw until the timer ends!' : ''}</div>
        </div>
      </section>
      <aside className="drawing-chat"><RoomChat messages={messages} onSend={onSend} live={Boolean(live)}/></aside>
    </div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Preview room chat" onClose={onDialogClose}><RoomChat messages={messages} onSend={onSend} live={Boolean(live)} onClose={closeChat}/></dialog>
    <dialog ref={leaveDialog} className="waiting-player-dialog drawing-clear" aria-labelledby="leave-drawing-title"><h2 id="leave-drawing-title">Leave this match?</h2><p>{live ? 'Your place stays in the match, but you will leave this room.' : 'Your drawings and preview scores will be discarded.'}</p><div><button className="room-secondary" onClick={() => leaveDialog.current?.close()}>Stay here</button><button className="room-primary" onClick={onBack}>{live ? 'Leave room' : 'Leave preview'}</button></div></dialog>
  </main>;
}
