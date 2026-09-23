import { useEffect, useRef, useState, type CSSProperties } from 'react';

const reactions = [{ symbol: '👋', label: 'Wave' }, { symbol: '😂', label: 'Laugh' }, { symbol: '🔥', label: 'Fire' }, { symbol: '❤️', label: 'Love' }, { symbol: '🎉', label: 'Celebrate' }];
type Reaction = { id: number; symbol: string; label: string; left: number; drift: number; expires: number };

export function RoomReactions() {
  const [active, setActive] = useState<Reaction[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(0);
  const lastSent = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive(current => current.some(item => item.expires <= Date.now()) ? current.filter(item => item.expires > Date.now()) : current);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  function react(symbol: string, label: string) {
    const now = Date.now();
    if (now - lastSent.current < 200) return;
    lastSent.current = now;
    setActive(current => [...current.slice(-11), { id: nextId.current++, symbol, label, left: 18 + Math.random() * 64, drift: Math.random() * 100 - 50, expires: now + 2800 }]);
    setAnnouncement(`You reacted with ${label.toLowerCase()}. Preview only.`);
  }

  return <>
    <div className="waiting-reaction-layer" aria-hidden="true">
      {active.map(item => <div key={item.id} className="waiting-floating-reaction" style={{ left: `${item.left}%`, '--drift': `${item.drift}px` } as CSSProperties} onAnimationEnd={() => setActive(current => current.filter(reaction => reaction.id !== item.id))}><span>{item.symbol}</span><small>You</small></div>)}
    </div>
    <section className="waiting-reaction-dock" aria-label="Room reactions">
      <div className="waiting-reaction-buttons">{reactions.map(item => <button key={item.label} type="button" aria-label={`React with ${item.label.toLowerCase()}`} title={item.label} onClick={() => react(item.symbol, item.label)}>{item.symbol}</button>)}</div>
    </section>
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}
