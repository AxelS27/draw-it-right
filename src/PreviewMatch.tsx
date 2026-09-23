import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, LoaderCircle, MessageCircle, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { DrawingRound } from './DrawingRound';
import { RoomChat, type ChatMessage } from './RoomChat';
import { FinalPodium, RoundGallery, Standings } from './MatchResults';
import { createPreviewResult, getStandings, initialMatch, matchReducer, previewPrompts, type Entrant } from './preview-match';
import type { RoomOptions } from './RoomPages';
import type { Profile } from './profile';
import './match-results.css';
import { useAudioScene } from './useAudio';

type Props = { options: RoomOptions; players: Profile[]; messages: ChatMessage[]; onSend: (text: string) => void; onBack: () => void };
export function PreviewMatch({ options, players, messages, onSend, onBack }: Props) {
  const [entrants] = useState<Entrant[]>(() => players.map((profile, id) => ({ id, profile, isYou: id === 0 })));
  const [state, dispatch] = useReducer(matchReducer, initialMatch);
  useAudioScene(state.phase === 'results' ? 'showcase' : state.phase === 'final' ? 'podium' : state.phase === 'waiting' ? 'judging' : state.phase, 2);
  const chatDialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const prompt = previewPrompts[(state.round - 1) % previewPrompts.length]!;
  const result = state.results.at(-1);
  const ownDrawing = result?.drawings.find(item => item.entrant.isYou);
  const standings = getStandings(entrants, state.results);
  const lastRound = state.round === options.rounds;
  const nextRound = useCallback(() => dispatch({ type: 'next', totalRounds: options.rounds }), [options.rounds]);
  const showLeaderboard = useCallback(() => dispatch({ type: 'leaderboard' }), []);
  const busy = state.phase === 'waiting' || state.phase === 'judging';
  const titles = { drawing: 'Draw', waiting: 'Drawing submitted!', judging: 'AI is judging…', results: 'The results are in!', leaderboard: 'Leaderboard', final: 'The final podium' };

  useEffect(() => {
    // Simulated room/AI events for this local preview, not a server timer.
    if (!busy) return;
    const timer = window.setTimeout(() => dispatch({ type: state.phase === 'waiting' ? 'judging' : 'results' }), state.phase === 'waiting' ? 1500 : 2400);
    return () => window.clearTimeout(timer);
  }, [state.phase, busy]);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
    if (!chatDialog.current?.open) heading.current?.focus({ preventScroll: true });
  }, [state.phase]);

  if (state.phase === 'drawing') return <DrawingRound key={state.round} options={options} round={state.round} prompt={prompt} messages={messages} onSend={onSend} onBack={onBack} onSubmit={(image, early) => dispatch({ type: 'submit', result: createPreviewResult(entrants, state.round, prompt, image, lastRound && options.doublePoints), wait: early && entrants.length > 1 })}/>;

  return <main className="drawing-page match-page">
    <header className="drawing-heading"><button className="waiting-icon-button" aria-label="Back to waiting room" onClick={onBack}><ArrowLeft size={20}/></button><div className="drawing-prompt"><span>{state.phase === 'final' ? 'MATCH COMPLETE' : `ROUND ${state.round} / ${options.rounds}`} <b>PREVIEW</b>{lastRound && options.doublePoints && state.phase !== 'final' && <b>2× POINTS</b>}</span><h1 ref={heading} tabIndex={-1}>{titles[state.phase]}</h1></div><button className="drawing-chat-toggle waiting-icon-button" aria-label="Open room chat" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={21}/></button></header>
    <p className="drawing-preview-note">Demo results only. Scores are made up, not based on your drawing. Other players are samples.</p>
    <div className="drawing-layout">
      <section className="match-main" aria-label={titles[state.phase]}>
        <div className={`match-content${busy ? ' is-busy' : ''}`} ref={content}>
          {busy ? <div className="match-judging" role="status"><div className="match-judging-icon">{state.phase === 'waiting' ? <Check size={42}/> : <Sparkles size={42}/>}</div><h2>{state.phase === 'waiting' ? 'You’re all set.' : 'AI is judging…'}</h2><p>{state.phase === 'waiting' ? 'Waiting for the other artists.' : 'Finding this round’s stars.'}</p><div className="match-progress"><LoaderCircle size={18}/><span>{state.phase === 'waiting' ? 'Simulating player submissions' : 'Simulating AI judging'}</span></div>{ownDrawing?.image && <img className="match-submitted-image" src={ownDrawing.image} alt="Your submitted drawing"/>}</div> : state.phase === 'results' && result ? <RoundGallery result={result}/> : state.phase === 'leaderboard' ? <><div className="match-section-heading"><div><span>THE BIG PICTURE</span><h2>Who’s leading the pack?</h2><p>Total points after {state.round} {state.round === 1 ? 'round' : 'rounds'}.</p></div><Trophy size={34}/></div><Standings standings={standings}/></> : state.phase === 'final' ? <FinalPodium standings={standings}/> : null}
        </div>
        {(state.phase === 'leaderboard' || state.phase === 'results') && <StageCountdown key={`${state.round}-${state.phase}`} duration={state.phase === 'leaderboard' ? 10 : 15} nextLabel={lastRound ? 'Final podium' : state.phase === 'results' ? 'Leaderboard' : 'Next round'} onNext={state.phase === 'results' && !lastRound ? showLeaderboard : nextRound}/>}
        {state.phase === 'final' && <div className="match-actions"><button className="room-secondary" data-sound="close" onClick={onBack}>Back to room</button><button className="room-primary" onClick={() => dispatch({ type: 'restart' })}>Play again<RotateCcw size={17}/></button></div>}
      </section>
      <aside className="drawing-chat"><RoomChat messages={messages} onSend={onSend}/></aside>
    </div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Preview room chat"><RoomChat messages={messages} onSend={onSend} onClose={() => chatDialog.current?.close()}/></dialog>
  </main>;
}

function StageCountdown({ duration, nextLabel, onNext }: { duration: number; nextLabel: string; onNext: () => void }) {
  const [deadline] = useState(() => Date.now() + duration * 1000);
  const [remaining, setRemaining] = useState(duration);
  const seconds = Math.ceil(remaining);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const timeLeft = Math.max(0, (deadline - Date.now()) / 1000);
      setRemaining(timeLeft);
      if (timeLeft > 0) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    // Keep phase changes independent of animation frames in background tabs.
    const timer = window.setTimeout(onNext, Math.max(0, deadline - Date.now()));
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [deadline, onNext]);
  return <div className="match-stage-countdown"><div><span>Up next: <strong>{nextLabel}</strong></span><span className="match-stage-time" role="timer" aria-label={`${nextLabel} in ${seconds} seconds`}><Clock3 size={18}/>{seconds}s</span></div><progress max={duration} value={remaining} aria-label="Time remaining before the next section"/></div>;
}
