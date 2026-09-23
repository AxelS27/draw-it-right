import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Copy, Crown, Link, LockKeyhole, MessageCircle, Settings2, UnlockKeyhole, Users, X } from 'lucide-react';
import { AvatarPreview } from './AvatarPreview';
import { RoomReactions } from './RoomReactions';
import { PreviewMatch } from './PreviewMatch';
import { RoomChat, type ChatMessage } from './RoomChat';
import { avatarOptions, type Profile } from './profile';
import type { RoomOptions } from './RoomPages';
import { navigate } from './navigation';
import './waiting-room.css';
import { useAudioScene } from './useAudio';

const names = ['Sunny', 'Beanie', 'Captain Ink', 'Mochi', 'Pixel', 'Coco', 'Doodlebug', 'Kiwi', 'Bubbles', 'Noodle', 'Peaches', 'Waffles', 'Pepper', 'Poppy', 'Ziggy', 'Maple', 'Biscuit', 'Luna', 'Mango', 'Sprout', 'Panda', 'Otter', 'Jelly', 'Pip', 'Boba', 'Tofu', 'Fluffy', 'Scribble', 'Olive', 'Pickle', 'Zippy', 'Cloud', 'Skippy', 'Comet', 'Pudding', 'Teddy', 'Nova', 'Marsh', 'Ducky'];
const samples = names.map((username, index): Profile => ({ username, avatar: {
  base: avatarOptions.base[index % avatarOptions.base.length]!,
  color: avatarOptions.color[index % avatarOptions.color.length]!,
  face: avatarOptions.face[index % avatarOptions.face.length]!,
  accessory: avatarOptions.accessory[index % avatarOptions.accessory.length]!,
} }));
type Props = { profile: Profile; options: RoomOptions; code: string; duration: string; hidden: boolean; onEdit: () => void; notice: string; onCopy: (value: string, label: string) => Promise<void> };
export function WaitingRoom({ profile, options, code, duration, hidden, onEdit, notice, onCopy }: Props) {
  const [players, setPlayers] = useState(() => samples.slice(0, 7));
  const [locked, setLocked] = useState(false);
  const [drawing, setDrawing] = useState(false);
  useAudioScene(drawing ? null : 'waiting', 1);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, author: 'Sunny', text: 'Hey crew! Who’s ready to draw?', sample: true },
    { id: 1, author: 'Beanie', text: 'My masterpiece will probably be a potato.', sample: true },
  ]);
  const nextMessageId = useRef(2);
  const chatDialog = useRef<HTMLDialogElement>(null);
  function addMessage(text: string) {
    const message = { id: nextMessageId.current++, author: 'You', text };
    setMessages(current => [...current.slice(-99), message]);
  }
  const grid = useRef<HTMLDivElement>(null);
  const playerDialog = useRef<HTMLDialogElement>(null);
  const [columns, setColumns] = useState(4);
  const visiblePlayers = players.slice(0, options.capacity - 1);
  const count = visiblePlayers.length + 1;

  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || !entry.contentRect.width || !entry.contentRect.height) return;
      const { width, height } = entry.contentRect;
      let bestColumns = 1;
      let bestScore = 0;
      for (let candidate = 1; candidate <= Math.min(count, 10); candidate++) {
        const rows = Math.ceil(count / candidate);
        const cellWidth = (width - (candidate - 1) * 8) / candidate;
        const cellHeight = (height - (rows - 1) * 8) / rows;
        const score = Math.min(cellWidth, cellHeight * 1.15);
        if (score > bestScore) { bestScore = score; bestColumns = candidate; }
      }
      setColumns(bestColumns);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count, hidden, drawing]);

  useEffect(() => {
    if (selected) playerDialog.current?.showModal();
    else playerDialog.current?.close();
  }, [selected]);
  useEffect(() => {
    if (hidden) { playerDialog.current?.close(); chatDialog.current?.close(); }
  }, [hidden]);

  if (drawing) return <PreviewMatch players={[profile, ...visiblePlayers]} options={options} messages={messages} onSend={addMessage} onBack={() => setDrawing(false)}/>;

  return <main className="waiting-page" hidden={hidden}>
    <div className="waiting-top">
      <div className="waiting-room-name"><button type="button" className="waiting-icon-button" aria-label="Back to lobby" onClick={() => navigate('/')}><ArrowLeft size={20}/></button><div><span>WAITING ROOM <b>PREVIEW</b></span><h1 title={options.name || 'The doodle club'}>{options.name || 'The doodle club'}</h1></div></div>
      <div className="waiting-invite"><div><span>ROOM CODE</span><strong>{code}</strong></div><button type="button" className="waiting-icon-button" aria-label="Copy code" title="Copy code" onClick={() => void onCopy(code, 'Code')}><Copy size={18}/></button><button type="button" className="waiting-icon-button" aria-label="Copy preview link" title="Copy preview link" onClick={() => void onCopy(`${window.location.origin}/room/${code}`, 'Preview link')}><Link size={18}/></button></div>
    </div>
    <p className="waiting-preview-note">Sample players, local chat & reactions. No live room or invites.</p>
    <div className="waiting-layout">
      <div className="waiting-player-column">
      <section className="waiting-crew" aria-labelledby="waiting-crew-title">
        <div className="waiting-crew-heading"><h2 id="waiting-crew-title"><Users size={18}/><span>{count}<small> / {options.capacity} players</small></span></h2><div><button type="button" className="waiting-small-button" onClick={() => setPlayers(samples.slice(0, options.capacity - 1))}>Fill room</button><button type="button" className="waiting-small-button" onClick={() => setPlayers(samples.slice(0, 7))}>Reset</button><button type="button" className="waiting-icon-button" aria-label={locked ? 'Unlock room' : 'Lock room'} aria-pressed={locked} title={locked ? 'Locked (preview)' : 'Open (preview)'} onClick={() => setLocked(!locked)}>{locked ? <LockKeyhole size={17}/> : <UnlockKeyhole size={17}/>}</button></div></div>
        <div className="waiting-player-grid" ref={grid} style={{ '--columns': columns, '--rows': Math.ceil(count / columns) } as CSSProperties}>
          {[profile, ...visiblePlayers].map((player, index) => <button type="button" key={index === 0 ? 'host' : player.username} className={`waiting-player${index === 0 ? ' is-host' : ''}`} aria-label={`${player.username}${index === 0 ? ', you, host' : ', sample player. Player options'}`} title={`${player.username}${index === 0 ? ' (You, host)' : ' (Sample player)'}`} onClick={() => setSelected(player)}>
            {index === 0 && <Crown className="waiting-crown" size={13} aria-hidden="true"/>}<AvatarPreview avatar={player.avatar}/><span>{player.username}{index === 0 && <small> · you</small>}</span>
          </button>)}
        </div>
        <div className="waiting-crew-footer"><span><Crown size={13}/>You’re the host</span><span>All players in view</span><button type="button" className="waiting-mobile-chat-button" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={16}/>Chat</button></div>
      </section>
      {options.reactions && !hidden && <RoomReactions/>}
      </div>
      <aside className="waiting-chat-desktop"><RoomChat messages={messages} onSend={addMessage}/></aside>
    </div>
    <div className="waiting-bottom"><button type="button" className="waiting-settings" onClick={onEdit}><Settings2 size={18}/><span><strong>{options.rounds} rounds <span>·</span> {duration}</strong><small>Edit room settings</small></span></button><div className="waiting-start"><span>Try a preview match</span><button className="room-primary" type="button" onClick={() => setDrawing(true)}>Start game<ArrowRight size={17}/></button></div></div>
    <div className="waiting-toast" role="status">{notice}</div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Preview room chat"><RoomChat messages={messages} onSend={addMessage} onClose={() => chatDialog.current?.close()}/></dialog>
    <dialog ref={playerDialog} className="waiting-player-dialog" aria-labelledby="waiting-player-title" onClose={() => setSelected(null)}>
      {selected && <><button type="button" className="waiting-icon-button waiting-dialog-close" data-sound="close" aria-label="Close player options" onClick={() => setSelected(null)}><X size={20}/></button><AvatarPreview avatar={selected.avatar}/><h2 id="waiting-player-title">{selected.username}</h2><p>{selected === profile ? 'That’s you! You’re hosting this preview.' : 'A sample player, not a connected user.'}</p>{selected !== profile && <button className="room-secondary" type="button" onClick={() => { setPlayers(current => current.filter(player => player.username !== selected.username)); setSelected(null); }}>Remove sample player</button>}</>}
    </dialog>
  </main>;
}
