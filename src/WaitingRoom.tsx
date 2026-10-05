import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Copy, Crown, Link, LockKeyhole, MessageCircle, QrCode, Settings2, UnlockKeyhole, Users, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AvatarPreview } from './AvatarPreview';
import { roomError, sendMessage, watchMessages, type LiveMessage, type Room, type RoomOptions } from './rooms';
import { RoomChat, type ChatMessage } from './RoomChat';
import { RoomReactions } from './RoomReactions';
import { navigate } from './navigation';
import { nextHost } from './room-order';
import { useAudioScene } from './useAudio';
import './waiting-room.css';

type Props = { room: Room; uid: string; code: string; duration: string; busy: boolean; notice: string; onEdit: () => void; onCopy: (value: string, label: string) => Promise<void>; onAction: (action: 'settings' | 'lock' | 'start' | 'leave' | 'remove' | 'transfer' | 'close', value?: RoomOptions | string) => void };
export function WaitingRoom({ room, uid, code, duration, busy, notice, onEdit, onCopy, onAction }: Props) {
  useAudioScene('waiting', 1);
  const grid = useRef<HTMLDivElement>(null);
  const playerDialog = useRef<HTMLDialogElement>(null);
  const qrDialog = useRef<HTMLDialogElement>(null);
  const chatDialog = useRef<HTMLDialogElement>(null);
  const qrButton = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const [columns, setColumns] = useState(4);
  const players = Object.entries(room.players).sort(([a], [b]) => a === room.host ? -1 : b === room.host ? 1 : 0);
  const count = players.length;
  const isHost = uid === room.host;
  const inviteUrl = `${window.location.origin}/room/${code}`;
  const localInvite = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  function closeQr() { qrDialog.current?.close(); qrButton.current?.focus(); }
  async function send(text: string) {
    try { await sendMessage(code, uid, text); }
    catch (error) { throw new Error(roomError(error)); }
  }
  const chatMessages: ChatMessage[] = messages.map(message => ({ id: message.id, author: room.players[message.sender]?.username ?? 'Former player', text: message.text, isYou: message.sender === uid }));

  useEffect(() => watchMessages(code, setMessages, setChatError), [code]);

  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || !entry.contentRect.width || !entry.contentRect.height) return;
      const { width, height } = entry.contentRect;
      let bestColumns = 1, bestScore = 0;
      for (let candidate = 1; candidate <= Math.min(count, 10); candidate++) {
        const rows = Math.ceil(count / candidate);
        const score = Math.min((width - (candidate - 1) * 8) / candidate, (height - (rows - 1) * 8) / rows * 1.15);
        if (score > bestScore) { bestScore = score; bestColumns = candidate; }
      }
      setColumns(bestColumns);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    if (selected && room.players[selected]) playerDialog.current?.showModal();
    else { playerDialog.current?.close(); if (selected) setSelected(null); }
  }, [selected, room.players]);

  const selectedProfile = selected ? room.players[selected] : null;
  return <main className="waiting-page">
    <div className="waiting-top">
      <div className="waiting-room-name"><button type="button" className="waiting-icon-button" aria-label="Back to lobby" onClick={() => navigate('/')}><ArrowLeft size={20}/></button><div><span>ROOM {room.status === 'started' ? '· MATCH STARTED' : '· WAITING FOR PLAYERS'}</span><h1 title={room.options.name || 'The doodle club'}>{room.options.name || 'The doodle club'}</h1></div></div>
      <div className="waiting-invite"><div><span>ROOM CODE</span><strong>{code}</strong></div><button type="button" className="waiting-icon-button" aria-label="Copy code" onClick={() => void onCopy(code, 'Code')}><Copy size={18}/></button><button type="button" className="waiting-icon-button waiting-copy-link" aria-label="Copy invite link" onClick={() => void onCopy(inviteUrl, 'Invite link')}><Link size={18}/></button><button ref={qrButton} type="button" className="waiting-icon-button" aria-label="Show invite QR code" aria-haspopup="dialog" onClick={() => qrDialog.current?.showModal()}><QrCode size={20}/></button></div>
    </div>
    <p className="waiting-preview-note">{room.status === 'started' ? 'Match started. Live drawing and scoring are not available yet.' : room.locked ? 'Room locked. New players cannot join.' : 'Share the code or invite link to bring friends in.'}</p>
    <div className="waiting-layout waiting-live-layout"><div className="waiting-player-column"><section className="waiting-crew" aria-labelledby="waiting-crew-title">
      <div className="waiting-crew-heading"><h2 id="waiting-crew-title"><Users size={18}/><span>{count}<small> / {room.options.capacity} players</small></span></h2>{isHost && room.status === 'waiting' && <button type="button" className="waiting-icon-button" disabled={busy} aria-label={room.locked ? 'Unlock room' : 'Lock room'} aria-pressed={room.locked} onClick={() => onAction('lock')}>{room.locked ? <LockKeyhole size={17}/> : <UnlockKeyhole size={17}/>}</button>}</div>
      <div className="waiting-player-grid" ref={grid} style={{ '--columns': columns, '--rows': Math.ceil(count / columns) } as CSSProperties}>
        {players.map(([id, player]) => <button type="button" key={id} className={`waiting-player${id === room.host ? ' is-host' : ''}`} aria-label={`${player.username}${id === room.host ? ', host' : ''}${id === uid ? ', you' : ''}`} onClick={() => setSelected(id)}>{id === room.host && <Crown className="waiting-crown" size={13} aria-hidden="true"/>}<AvatarPreview avatar={player.avatar}/><span>{player.username}{id === uid && <small> · you</small>}</span></button>)}
      </div><div className="waiting-crew-footer"><span><Crown size={13}/>{isHost ? 'You’re the host' : `${room.players[room.host]?.username ?? 'Host'} is hosting`}</span><span>{room.status === 'waiting' ? 'Waiting for players' : 'Match started'}</span><button type="button" className="waiting-mobile-chat-button" onClick={() => chatDialog.current?.showModal()}><MessageCircle size={16}/>Chat</button></div>
    </section>{room.options.reactions && room.status === 'waiting' && <RoomReactions code={code} uid={uid} players={room.players}/>}</div><aside className="waiting-chat-desktop waiting-live-sidebar"><div className="waiting-live-summary"><h2>Room settings</h2><p>{room.options.rounds} rounds · {duration} per round</p><p>{room.options.doublePoints ? 'Double-point finale planned' : 'Standard scoring planned'} · {room.options.reactions ? 'Reactions on' : 'Reactions off'}</p><p>{room.options.lateJoin ? 'Late join planned for gameplay' : 'No late joining'}</p></div><RoomChat live messages={chatMessages} onSend={send}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</aside></div>
    <div className="waiting-bottom"><div className="waiting-start"><button className="room-secondary" type="button" disabled={busy} onClick={() => { if (!isHost || count === 1 || window.confirm(`Leave room? ${room.players[nextHost(room.joinOrder, uid) ?? '']?.username ?? 'The next player'} will become host.`)) onAction('leave'); }}>Leave room</button>{isHost && <button className="waiting-end-room" type="button" disabled={busy} onClick={() => { if (window.confirm('End this room for everyone?')) onAction('close'); }}>End room</button>}{isHost && room.status === 'waiting' && <button type="button" className="waiting-settings" onClick={onEdit}><Settings2 size={18}/>Edit settings</button>}</div>{isHost && room.status === 'waiting' && <div className="waiting-start"><span>{count < 2 ? 'Need at least 2 players' : 'Everyone ready?'}</span><button className="room-primary" type="button" disabled={busy || count < 2} onClick={() => onAction('start')}>Start game</button></div>}</div>
    <div className="waiting-toast" role="alert">{notice}</div>
    <dialog ref={chatDialog} className="waiting-chat-dialog" aria-label="Room chat"><RoomChat live messages={chatMessages} onSend={send} onClose={() => chatDialog.current?.close()}/>{chatError && <p className="waiting-chat-error" role="alert">{chatError}</p>}</dialog>
    <dialog ref={qrDialog} className="waiting-qr-dialog" aria-labelledby="waiting-qr-title" aria-describedby="waiting-qr-description" onClose={() => qrButton.current?.focus()} onClick={event => { if (event.target === event.currentTarget) closeQr(); }}>
      <button type="button" className="waiting-qr-close" aria-label="Close QR code" onClick={closeQr}><X size={22}/></button>
      <span className="waiting-qr-eyebrow">DRAW IT RIGHT!</span>
      <h2 id="waiting-qr-title">Scan to join the room</h2>
      <p id="waiting-qr-description">Point your camera at this code, then log in to join.</p>
      <div className="waiting-qr-image"><QRCodeSVG value={inviteUrl} size={440} level="M" marginSize={4} title={`Invite link for room ${code}`}/></div>
      <p className="waiting-qr-code">Room code <strong>{code}</strong></p>
      <p className="waiting-qr-link">{inviteUrl}</p>
      {localInvite && <p className="waiting-qr-local">For phones to join, open this room on your published site. A localhost link only works on this computer.</p>}
    </dialog>
    <dialog ref={playerDialog} className="waiting-player-dialog" aria-labelledby="waiting-player-title" onClose={() => setSelected(null)}>{selectedProfile && <><button type="button" className="waiting-icon-button waiting-dialog-close" aria-label="Close player options" onClick={() => setSelected(null)}><X size={20}/></button><AvatarPreview avatar={selectedProfile.avatar}/><h2 id="waiting-player-title">{selectedProfile.username}</h2><p>{selected === room.host ? 'Room host' : selected === uid ? 'That’s you!' : 'Player in this room'}</p>{isHost && selected !== uid && <button className="room-primary" disabled={busy} type="button" onClick={() => { if (window.confirm(`Make ${selectedProfile.username} the new host?`)) { onAction('transfer', selected!); setSelected(null); } }}>Make host</button>}{isHost && selected !== uid && room.status === 'waiting' && <button className="room-secondary" disabled={busy} type="button" onClick={() => { onAction('remove', selected!); setSelected(null); }}>Remove player</button>}</>}</dialog>
  </main>;
}
