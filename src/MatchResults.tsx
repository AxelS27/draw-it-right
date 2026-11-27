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
    {drawing.prediction && <div className="result-ai-prediction">{drawing.prediction}{drawing.confidence !== undefined ? ` · ${Math.round(drawing.confidence * 100)}%` : ''}</div>}
  </article>;
}

export function RoundGallery({ result }: { result: RoundResult }) {
  const ownIndex = result.drawings.findIndex(drawing => drawing.entrant.isYou);
  const own = result.drawings[ownIndex];
  return <>
    <div className="match-section-heading"><div><span>ROUND {result.round} · {result.prompt.toUpperCase()}</span><h2>This round’s stars</h2></div>{own && <div className="match-your-score">You placed <strong>#{ownIndex + 1}</strong><span>+{own.points.toLocaleString()} pts{result.multiplier === 2 ? ' · 2× round' : ''}</span></div>}</div>
    {own?.prediction && <p className="match-own-prediction">Your drawing: <strong>{own.prediction}</strong> · {Math.round((own.confidence ?? 0) * 100)}%</p>}
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

const confettiSeed = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function FinalPodium({ standings }: { standings: Standing[] }) {
  const ownRank = standings.findIndex(row => row.entrant.isYou);
  const podiumSize = Math.min(3, standings.length);
  const championDelay = podiumSize > 1 ? 3 + (podiumSize - 1) * 2 : 3;
  const reducedMotion = useReducedMotion();
  const [cue, setCue] = useState<'intro' | 'suspense' | 'winner'>('intro');
  const instant = reducedMotion;
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
    const champ = window.setTimeout(() => gameAudio.play('champion'), 0);
    const cheer = window.setTimeout(() => gameAudio.play('cheers'), 220);
    return () => { window.clearTimeout(champ); window.clearTimeout(cheer); };
  }, [revealed]);
  return <div className={`match-celebration${cue === 'suspense' && !instant ? ' is-suspense' : ''}${revealed ? ' is-revealed' : ''}${instant ? ' is-instant' : ''}`} style={{ '--champion-delay': `${championDelay}s`, '--summary-delay': `${championDelay + 1.2}s` } as CSSProperties}>
    <div className="match-spotlight" aria-hidden="true"/>
    <div className="match-champion-burst" aria-hidden="true"/>
    <div className="match-confetti" aria-hidden="true">{Array.from({ length: 80 }, (_, index) => {
      const left = 1 + confettiSeed(index, 1) * 98;
      const delay = championDelay + confettiSeed(index, 2) * 1.4;
      const dur = 2.2 + confettiSeed(index, 3) * 2.0;
      const drift = (confettiSeed(index, 4) - 0.5) * 320;
      const spin = (confettiSeed(index, 5) > 0.5 ? 1 : -1) * (360 + Math.round(confettiSeed(index, 6) * 540));
      const w = 6 + Math.round(confettiSeed(index, 7) * 6);
      const h = 8 + Math.round(confettiSeed(index, 8) * 10);
      return <i key={index} style={{ left: `${left.toFixed(2)}%`, width: `${w}px`, height: `${h}px`, backgroundColor: ['#ffdf91', '#91d7c5', '#edb4cf', '#b9c5ff', '#ff9f7f'][index % 5], '--fall-delay': `${delay.toFixed(2)}s`, '--fall-dur': `${dur.toFixed(2)}s`, '--drift': `${drift.toFixed(0)}px`, '--spin': `${spin}deg` } as CSSProperties}/>;
    })}</div>
    <div className="match-final-heading"><span>{revealed ? '🏆 MEET YOUR CHAMPION' : 'THE FINAL REVEAL'}</span><h2 aria-live="polite">{revealed ? 'We have a champion!' : cue === 'suspense' ? '🥁 Drumroll please…' : 'Every point led to this.'}</h2><div className="match-reveal-cue">{revealed ? 'A huge round of applause for our artists!' : cue === 'suspense' ? 'Hold your breath… the #1 artist is…' : 'The podium awaits.'}</div><p className="match-final-summary">You finished #{ownRank + 1} with {standings[ownRank]?.total.toLocaleString()} points.</p></div>
    <div className="match-podium">{standings.slice(0, 3).map((row, index) => <article key={row.entrant.id} className={`match-podium-player podium-${index + 1}`} style={{ '--reveal-delay': `${index === 0 ? championDelay : 1 + (podiumSize - 1 - index) * 2}s` } as CSSProperties}>{index === 0 && <span className="match-champion-crown" aria-label="Champion"><Crown size={32}/></span>}<AvatarPreview avatar={row.entrant.profile.avatar}/><h3>{row.entrant.profile.username}{row.entrant.isYou && <small> · you</small>}</h3><strong>{row.total.toLocaleString()} pts</strong><div className={`place-${index + 1}`}>#{index + 1}</div></article>)}</div>
    <div className="match-final-summary">
      <div className="match-gallery-heading"><h3>Final standings</h3><span>Everyone made their mark.</span></div>
      <Standings standings={standings} final/>
    </div>
  </div>;
}
