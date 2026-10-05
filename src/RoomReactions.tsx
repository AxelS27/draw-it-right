import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { reactionSymbols, roomError, sendReaction, watchReactions, type ReactionSymbol } from './rooms';
import type { Profile } from './profile';

const labels = ['Wave', 'Laugh', 'Fire', 'Love', 'Celebrate'] as const;
type FloatingReaction = { id: number; symbol: ReactionSymbol; name: string; left: number; drift: number; expires: number };

export function RoomReactions({ code, uid, players }: { code: string; uid: string; players: Record<string, Profile> }) {
  const [active, setActive] = useState<FloatingReaction[]>([]);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(0);
  const lastSent = useRef(0);
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    const unsubscribe = watchReactions(code, (sender, symbol) => {
      const name = sender === uid ? 'You' : playersRef.current[sender]?.username ?? 'Player';
      setActive(current => [...current.slice(-11), { id: nextId.current++, symbol, name, left: 18 + Math.random() * 64, drift: Math.random() * 100 - 50, expires: Date.now() + 2800 }]);
      setAnnouncement(`${name} reacted.`);
    }, setError);
    const timer = window.setInterval(() => {
      setActive(current => current.some(item => item.expires <= Date.now()) ? current.filter(item => item.expires > Date.now()) : current);
    }, 500);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [code, uid]);

  async function react(symbol: ReactionSymbol) {
    const now = Date.now();
    if (now - lastSent.current < 1100) return;
    lastSent.current = now;
    setError('');
    try { await sendReaction(code, uid, symbol); }
    catch (failure) { setError(roomError(failure)); }
  }

  return <>
    <div className="waiting-reaction-layer" aria-hidden="true">
      {active.map(item => <div key={item.id} className="waiting-floating-reaction" style={{ left: `${item.left}%`, '--drift': `${item.drift}px` } as CSSProperties} onAnimationEnd={() => setActive(current => current.filter(reaction => reaction.id !== item.id))}><span>{item.symbol}</span><small>{item.name}</small></div>)}
    </div>
    <section className="waiting-reaction-dock" aria-label="Room reactions">
      <div className="waiting-reaction-buttons">{reactionSymbols.map((symbol, index) => <button key={symbol} type="button" aria-label={`React with ${labels[index]!.toLowerCase()}`} title={labels[index]} onClick={() => void react(symbol)}>{symbol}</button>)}</div>
    </section>
    {error && <p className="waiting-reaction-error" role="alert">{error}</p>}
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}
