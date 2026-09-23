import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, MessageCircle, Send } from 'lucide-react';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import { RoomChat, type ChatMessage } from './RoomChat';
import type { RoomOptions } from './RoomPages';
import type { PreviewPrompt } from './preview-match';
import './drawing-round.css';
import { gameAudio } from './audio';

type Props = { options: RoomOptions; round: number; prompt: PreviewPrompt; messages: ChatMessage[]; onSend: (text: string) => void; onBack: () => void; onSubmit: (image: string, early: boolean) => void };
export function DrawingRound({ options, round, prompt, messages, onSend, onBack, onSubmit }: Props) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const sent = useRef(false);
  const canvas = useRef<DrawingCanvasHandle>(null);
  const chatDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const revealEnd = startedAt + 3000;
  const drawingEnd = revealEnd + options.timer * 1000;
  const revealing = now < revealEnd;
  const expired = now >= drawingEnd;
  const remaining = Math.max(0, Math.ceil((drawingEnd - now) / 1000));
  const countdown = Math.max(1, Math.ceil((revealEnd - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (revealing || (remaining > 0 && remaining <= 5)) gameAudio.play('tick');
  }, [revealing, revealing ? countdown : remaining]);
  useEffect(() => {
    if (!expired || sent.current) return;
    sent.current = true;
    gameAudio.play('submit');
    onSubmit(canvas.current?.snapshot() ?? '', false);
  }, [expired, onSubmit]);

  function submit() {
    if (sent.current || Date.now() < revealEnd) return;
    sent.current = true;
    gameAudio.play('submit');
    onSubmit(canvas.current?.snapshot() ?? '', Date.now() < drawingEnd);
  }

  return <main className="drawing-page">
    <header className="drawing-heading">
      <button className="waiting-icon-button" aria-label="Back to waiting room" onClick={() => leaveDialog.current?.showModal()}><ArrowLeft size={20}/></button>
      <div className="drawing-prompt"><span>ROUND {round} / {options.rounds} <b>PREVIEW</b>{round === options.rounds && options.doublePoints && <b>2× POINTS</b>}</span><h1>Draw <strong>a {prompt}</strong></h1></div>
      <div className={`drawing-clock${!revealing && remaining <= 10 ? ' is-urgent' : ''}`} aria-label={revealing ? 'Get ready' : `${remaining} seconds remaining`}><Clock3 size={21}/><strong>{revealing ? `${options.timer}s` : `${remaining}s`}</strong></div>
      <button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={21}/></button>
    </header>
    <p className="drawing-preview-note">Local preview. Sample results, not real AI scores.</p>
    <div className="drawing-layout">
      <section className="drawing-workspace" aria-label="Your drawing">
        <div className="drawing-editor">
          <DrawingCanvas ref={canvas} locked={revealing || expired}/>
          {revealing && <div className="drawing-reveal"><h2>Draw a<strong>{prompt}</strong></h2><strong className="drawing-countdown" key={countdown}>{countdown}</strong></div>}
        </div>
        <div className="drawing-actions">
          <div role="status">{revealing ? '' : 'Your masterpiece is private. Make every second count!'}</div>
          <button className="room-primary" disabled={revealing || expired} onClick={submit}>Submit<Send size={17}/></button>
        </div>
      </section>
      <aside className="drawing-chat"><RoomChat messages={messages} onSend={onSend}/></aside>
    </div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Preview room chat"><RoomChat messages={messages} onSend={onSend} onClose={() => chatDialog.current?.close()}/></dialog>
    <dialog ref={leaveDialog} className="waiting-player-dialog drawing-clear" aria-labelledby="leave-drawing-title"><h2 id="leave-drawing-title">Leave this match?</h2><p>Your drawings and preview scores will be discarded.</p><div><button className="room-secondary" onClick={() => leaveDialog.current?.close()}>Stay here</button><button className="room-primary" onClick={onBack}>Leave preview</button></div></dialog>
  </main>;
}
