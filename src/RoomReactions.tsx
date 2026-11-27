import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { reactionSymbols, roomError, sendReaction, watchReactions, type ReactionSymbol } from './rooms';
import type { Profile } from './profile';

const labels = ['Wave', 'Laugh', 'Fire', 'Love', 'Celebrate'] as const;
type FloatingReaction = { id: number; symbol: ReactionSymbol; name: string; left: number; drift: number; expires: number };

export function RoomReactions({ code, uid, players, edgesOnly = false }: { code: string; uid: string; players: Record<string, Profile>; edgesOnly?: boolean }) {
  const [active, setActive] = useState<FloatingReaction[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(0);
  const lastSent = useRef(0);
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function spawn(name: string, symbol: ReactionSymbol) {
    const left = edgesOnly ? (Math.random() < 0.5 ? 4 + Math.random() * 7 : 89 + Math.random() * 7) : 16 + Math.random() * 68;
    const drift = edgesOnly ? Math.random() * 20 - 10 : Math.random() * 84 - 42;
    setActive(current => [...current.slice(-35), { id: nextId.current++, symbol, name, left, drift, expires: Date.now() + 4300 }]);
    setAnnouncement(`${name} reacted.`);
  }

  useEffect(() => {
    const unsubscribe = watchReactions(code, (sender, symbol) => {
      if (sender === uid) return;
      const name = playersRef.current[sender]?.username ?? 'Player';
      spawn(name, symbol);
    }, setError);
    const timer = window.setInterval(() => {
      setActive(current => current.some(item => item.expires <= Date.now()) ? current.filter(item => item.expires > Date.now()) : current);
    }, 2000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [code, uid]);

  async function react(symbol: ReactionSymbol) {
    const now = Date.now();
    if (now - lastSent.current < 5000) return;
    lastSent.current = now;
    setCooldown(5);
    spawn('You', symbol);
    setError('');
    try { await sendReaction(code, uid, symbol); }
    catch (failure) { setError(roomError(failure)); }
  }

  return <>
    <div className="waiting-reaction-layer" aria-hidden="true">
      {active.map(item => <div key={item.id} className="waiting-floating-reaction" style={{ left: `${item.left}%`, '--drift': `${item.drift}px` } as CSSProperties} onAnimationEnd={() => setActive(current => current.filter(reaction => reaction.id !== item.id))}><span>{item.symbol}</span><small>{item.name}</small></div>)}
    </div>
    <section className="waiting-reaction-dock" aria-label="Room reactions">
      <div className="waiting-reaction-buttons">{reactionSymbols.map((symbol, index) => <button key={symbol} type="button" disabled={cooldown > 0} aria-label={`React with ${labels[index]!.toLowerCase()}`} title={cooldown > 0 ? `Wait ${cooldown}s` : labels[index]} onClick={() => void react(symbol)}>{symbol}</button>)}</div>
    </section>
    {error && <p className="waiting-reaction-error" role="alert">{error}</p>}
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}
