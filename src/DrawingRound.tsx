import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, MessageCircle, Send } from 'lucide-react';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import { RoomChat, type ChatMessage } from './RoomChat';
import type { RoomOptions } from './RoomPages';
import './drawing-round.css';
import { gameAudio } from './audio';

type LiveRound = { revealing: boolean; remaining: number; submitted: boolean; onSubmit: (image: string) => Promise<void>; onDraft: (image: string | null) => Promise<void> };
type Props = { options: RoomOptions; round: number; prompt: string; messages: ChatMessage[]; onSend: (text: string) => void | Promise<void>; onBack: () => void; onSubmit: (image: string, early: boolean) => void; live?: LiveRound };
export function DrawingRound({ options, round, prompt, messages, onSend, onBack, onSubmit, live }: Props) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const sent = useRef(false);
  const savedDraft = useRef(false);
  const draftBusy = useRef(false);
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const canvas = useRef<DrawingCanvasHandle>(null);
  const chatDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
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
    try { await current.onDraft(image); if (image) savedDraft.current = true; }
    catch { /* Retry on the next interval. */ }
    finally { draftBusy.current = false; }
  }
  useEffect(() => {
    if (!live || live.submitted) return;
    const timer = window.setInterval(() => void saveDraft(), 4000);
    return () => window.clearInterval(timer);
  }, [Boolean(live), live?.submitted]);
  useEffect(() => {
    if (live && !live.revealing && live.remaining > 0 && live.remaining <= 2 && !live.submitted) void submit();
  }, [live?.remaining, live?.submitted, live?.revealing]);

  async function submit() {
    if (sent.current || revealing || expired || (live && !canvas.current?.hasDrawing())) return;
    sent.current = true;
    gameAudio.play('submit');
    if (!live) { onSubmit(canvas.current?.snapshot() ?? '', Date.now() < drawingEnd); return; }
    setSending(true);
    try { await live.onSubmit(canvas.current!.snapshot('jpeg')); setSendError(''); }
    catch (failure) { sent.current = false; setSendError(failure instanceof Error ? failure.message : 'Couldn’t submit. Try again.'); }
    finally { setSending(false); }
  }

  return <main className="drawing-page">
    <header className="drawing-heading">
      <button className="waiting-icon-button" aria-label="Back to waiting room" onClick={() => leaveDialog.current?.showModal()}><ArrowLeft size={20}/></button>
      <div className="drawing-prompt"><span>ROUND {round} / {options.rounds} <b>{live ? 'LIVE MATCH' : 'PREVIEW'}</b>{round === options.rounds && options.doublePoints && <b>2× POINTS</b>}</span><h1>Draw <strong>a {prompt}</strong></h1></div>
      <div className={`drawing-clock${!revealing && remaining <= 10 ? ' is-urgent' : ''}`} aria-label={revealing ? 'Get ready' : `${remaining} seconds remaining`}><Clock3 size={21}/><strong>{revealing ? `${options.timer}s` : `${remaining}s`}</strong></div>
      <button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={21}/></button>
    </header>
    <p className="drawing-preview-note">{live ? 'Shared round · server-timed. Judging is simulated, not real AI.' : 'Local preview. Sample results, not real AI scores.'}</p>
    <div className="drawing-layout">
      <section className="drawing-workspace" aria-label="Your drawing">
        <div className="drawing-editor">
          <DrawingCanvas ref={canvas} locked={revealing || expired || sending} onEmpty={live ? () => { if (savedDraft.current) void live.onDraft(null).catch(() => { /* The interval retries. */ }); } : undefined}/>
          {revealing && <div className="drawing-reveal"><h2>Draw a<strong>{prompt}</strong></h2><strong className="drawing-countdown" key={countdown}>{countdown}</strong></div>}
        </div>
        <div className="drawing-actions">
          <div role="status">{revealing ? '' : live?.submitted ? 'Drawing submitted. Waiting for everyone.' : sendError || 'Your masterpiece is private. Make every second count!'}</div>
          <button className="room-primary" disabled={revealing || expired || sending} onClick={() => void submit()}>{sending ? 'Sending…' : live?.submitted ? 'Submitted' : 'Submit'}<Send size={17}/></button>
        </div>
      </section>
      <aside className="drawing-chat"><RoomChat messages={messages} onSend={onSend} live={Boolean(live)}/></aside>
    </div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Preview room chat"><RoomChat messages={messages} onSend={onSend} live={Boolean(live)} onClose={() => chatDialog.current?.close()}/></dialog>
    <dialog ref={leaveDialog} className="waiting-player-dialog drawing-clear" aria-labelledby="leave-drawing-title"><h2 id="leave-drawing-title">Leave this match?</h2><p>{live ? 'Your place stays in the match, but you will leave this room.' : 'Your drawings and preview scores will be discarded.'}</p><div><button className="room-secondary" onClick={() => leaveDialog.current?.close()}>Stay here</button><button className="room-primary" onClick={onBack}>{live ? 'Leave room' : 'Leave preview'}</button></div></dialog>
  </main>;
}
