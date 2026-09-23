import { useEffect, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { Crown } from 'lucide-react';
import { gameAudio } from './audio';
import { AvatarPreview } from './AvatarPreview';
import type { RoundDrawing, RoundResult, Standing } from './preview-match';

function DrawingCard({ drawing, rank, winner = false }: { drawing: RoundDrawing; rank: number; winner?: boolean }) {
  return <article className={`result-drawing${winner ? ' is-winner' : ''}${drawing.entrant.isYou ? ' is-you' : ''}`}>
    <div className="result-drawing-image"><img src={drawing.image} alt={`${drawing.entrant.profile.username}'s drawing`} loading={winner ? 'eager' : 'lazy'}/><span className={`result-place place-${rank}`}>#{rank}</span></div>
    <div className="result-drawing-caption"><span title={drawing.entrant.profile.username}>{drawing.entrant.profile.username}{drawing.entrant.isYou && <small> · you</small>}</span><strong>{drawing.points.toLocaleString()}<small> pts</small></strong></div>
  </article>;
}

export function RoundGallery({ result }: { result: RoundResult }) {
  const ownIndex = result.drawings.findIndex(drawing => drawing.entrant.isYou);
  const own = result.drawings[ownIndex];
  return <>
    <div className="match-section-heading"><div><span>ROUND {result.round} · {result.prompt.toUpperCase()}</span><h2>This round’s stars</h2></div>{own && <div className="match-your-score">You placed <strong>#{ownIndex + 1}</strong><span>+{own.points.toLocaleString()} pts{result.multiplier === 2 ? ' · 2× round' : ''}</span></div>}</div>
    <div className="match-top-drawings">{result.drawings.slice(0, 3).map((drawing, index) => <DrawingCard key={drawing.entrant.id} drawing={drawing} rank={index + 1} winner/>)}</div>
    {result.drawings.length > 3 && <>
      <div className="match-gallery-heading"><h3>More masterpieces</h3><span>Highest to lowest score · {result.drawings.length - 3} drawings</span></div>
      <div className="match-gallery">{result.drawings.slice(3).map((drawing, index) => <DrawingCard key={drawing.entrant.id} drawing={drawing} rank={index + 4}/>)}</div>
    </>}
  </>;
}

export function Standings({ standings, final = false }: { standings: Standing[]; final?: boolean }) {
  return <div className="match-standings"><table><caption className="sr-only">{final ? 'Final standings' : 'Cumulative leaderboard'}. Total points across all completed rounds.</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">{final ? 'Last round' : 'This round'}</th><th scope="col">Total</th></tr></thead><tbody>{standings.map((row, index) => <tr key={row.entrant.id} className={row.entrant.isYou ? 'is-you' : undefined}><td><span className={`standings-place place-${index + 1}`}>{index + 1}</span></td><th scope="row"><div><AvatarPreview avatar={row.entrant.profile.avatar}/><span>{row.entrant.profile.username}{row.entrant.isYou && <small> · you</small>}</span></div></th><td>+{row.added.toLocaleString()}</td><td><strong>{row.total.toLocaleString()}</strong></td></tr>)}</tbody></table></div>;
}

export function FinalPodium({ standings }: { standings: Standing[] }) {
  const ownRank = standings.findIndex(row => row.entrant.isYou);
  const podiumSize = Math.min(3, standings.length);
  const championDelay = podiumSize > 1 ? 3 + (podiumSize - 1) * 2 : 3;
  const reducedMotion = useReducedMotion();
  const [cue, setCue] = useState<'intro' | 'suspense' | 'winner'>('intro');
  const [skipped, setSkipped] = useState(false);
  const instant = reducedMotion || skipped;
  const revealed = instant || cue === 'winner';
  useEffect(() => {
    if (instant) return;
    const suspense = window.setTimeout(() => {
      setCue('suspense');
      gameAudio.play('drumroll');
    }, (championDelay - 2.5) * 1000);
    const winner = window.setTimeout(() => setCue('winner'), championDelay * 1000);
    return () => { window.clearTimeout(suspense); window.clearTimeout(winner); };
  }, [championDelay, instant]);
  useEffect(() => {
    if (instant) return;
    const entrance = window.setTimeout(() => gameAudio.play('podium'), 0);
    const timers = Array.from({ length: Math.max(0, podiumSize - 1) }, (_, index) => window.setTimeout(() => gameAudio.play('reveal'), (1 + index * 2) * 1000));
    return () => { window.clearTimeout(entrance); timers.forEach(timer => window.clearTimeout(timer)); };
  }, [podiumSize, instant]);
  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => gameAudio.play('champion'), 0);
    return () => window.clearTimeout(timer);
  }, [revealed]);
  return <div className={`match-celebration${cue === 'suspense' && !instant ? ' is-suspense' : ''}${revealed ? ' is-revealed' : ''}${instant ? ' is-instant' : ''}`} style={{ '--champion-delay': `${championDelay}s`, '--summary-delay': `${championDelay + 1.2}s` } as CSSProperties}>
    <div className="match-spotlight" aria-hidden="true"/>
    <div className="match-confetti" aria-hidden="true">{Array.from({ length: 42 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, backgroundColor: ['#ffdf91', '#91d7c5', '#edb4cf', '#b9c5ff'][index % 4], '--fall-delay': `${championDelay + (index % 7) * 0.09}s`, '--drift': `${((index * 23) % 180) - 90}px` } as CSSProperties}/>)}</div>
    <div className="match-final-heading"><span>{revealed ? 'MEET YOUR CHAMPION' : 'THE FINAL REVEAL'}</span><h2 aria-live="polite">{revealed ? 'We have a champion!' : cue === 'suspense' ? 'One artist left…' : 'Every point led to this.'}</h2><div className="match-reveal-cue">{revealed ? 'A round of applause for our artists.' : cue === 'suspense' ? 'And the winner is…' : 'The podium awaits.'}</div><p className="match-final-summary">You finished #{ownRank + 1} with {standings[ownRank]?.total.toLocaleString()} points.</p></div>
    <div className="match-podium">{standings.slice(0, 3).map((row, index) => <article key={row.entrant.id} className={`match-podium-player podium-${index + 1}`} style={{ '--reveal-delay': `${index === 0 ? championDelay : 1 + (podiumSize - 1 - index) * 2}s` } as CSSProperties}>{index === 0 && <span className="match-champion-crown" aria-label="Champion"><Crown size={32}/></span>}<AvatarPreview avatar={row.entrant.profile.avatar}/><h3>{row.entrant.profile.username}{row.entrant.isYou && <small> · you</small>}</h3><strong>{row.total.toLocaleString()} pts</strong><div className={`place-${index + 1}`}>#{index + 1}</div></article>)}</div>
    {!revealed && <button type="button" className="match-skip-reveal" onClick={() => setSkipped(true)}>Skip reveal</button>}
    <div className="match-final-summary">
      <div className="match-gallery-heading"><h3>Final standings</h3><span>Everyone made their mark.</span></div>
      <Standings standings={standings} final/>
    </div>
  </div>;
}
