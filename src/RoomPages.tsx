import { useEffect, useState, type FormEvent } from 'react';
import { auth } from './firebase';
import { changeRoom, createRoom, defaultRoomOptions, joinRoom, roomError, watchRoom, type Room } from './rooms';
import { ArrowLeft, ArrowRight, Clock3, Minus, Plus, Settings2, Sparkles, Trophy, Users } from 'lucide-react';
import type { Profile } from './profile';
import { navigate } from './navigation';
import { WaitingRoom } from './WaitingRoom';
import './room.css';

import type { RoomOptions } from './rooms';
export type { RoomOptions } from './rooms';
const roomLimits = {
  rounds: { min: 1, max: 10, step: 1 },
  timer: { min: 10, max: 300, step: 10 },
  capacity: { min: 2, max: 40, step: 1 },
};
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes === 0 ? `${seconds} sec` : `${minutes} min${remainder ? ` ${remainder} sec` : ''}`;
}

function RoomStepper({ label, value, limits, display = String(value), hint, onChange }: {
  label: string; value: number; limits: { min: number; max: number; step: number }; display?: string; hint: string; onChange: (value: number) => void;
}) {
  return <div className="room-stepper">
    <div className="room-stepper-controls">
      <button type="button" data-sound="decrement" aria-label={`Decrease ${label}`} disabled={value <= limits.min} onClick={() => onChange(Math.max(limits.min, value - limits.step))}><Minus size={18} aria-hidden="true"/></button>
      <output aria-label={label} aria-live="polite" aria-atomic="true">{display}</output>
      <button type="button" data-sound="increment" aria-label={`Increase ${label}`} disabled={value >= limits.max} onClick={() => onChange(Math.min(limits.max, value + limits.step))}><Plus size={18} aria-hidden="true"/></button>
    </div>
    <p>{hint}</p>
  </div>;
}

function RoomForm({ initial, editing, busy, onSubmit, onCancel }: { initial: RoomOptions; editing: boolean; busy: boolean; onSubmit: (room: RoomOptions) => void; onCancel: () => void }) {
  const [options, setOptions] = useState(initial);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ ...options, name: options.name.trim() });
  }
  return <form className="room-card room-form" onSubmit={submit}>
    <div className="room-card-heading"><span className="room-icon"><Settings2 size={22}/></span><h1>{editing ? 'Room settings' : 'Create room'}</h1><div className="room-creator-doodles" aria-hidden="true"><Trophy/><Sparkles/><Clock3/></div></div>
    <label className="room-field">Room name <span>Optional</span><input value={options.name} maxLength={32} placeholder="The doodle club" onChange={event => setOptions({ ...options, name: event.target.value })}/></label>
    <div className="room-form-grid">
      <fieldset className="room-choice"><legend><Trophy size={16}/>Rounds</legend><RoomStepper label="rounds" value={options.rounds} limits={roomLimits.rounds} hint="1-10 rounds" onChange={rounds => setOptions({ ...options, rounds })}/></fieldset>
      <fieldset className="room-choice"><legend><Clock3 size={16}/>Drawing time</legend><RoomStepper label="drawing time" value={options.timer} display={formatDuration(options.timer)} limits={roomLimits.timer} hint="10 sec-5 min · 10 sec steps" onChange={timer => setOptions({ ...options, timer })}/></fieldset>
      <fieldset className="room-choice"><legend><Users size={16}/>Maximum players</legend><RoomStepper label="maximum players" value={options.capacity} limits={roomLimits.capacity} hint="2-40 players" onChange={capacity => setOptions({ ...options, capacity })}/></fieldset>
    </div>
    <div className="room-toggles">{([
      ['doublePoints', 'Double-point finale', 'Make the last round count twice.'],
      ['reactions', 'Emote reactions', 'Allow player reactions.'],
      ['lateJoin', 'Late joining (coming soon)', 'Unavailable until live rounds are implemented.'],
    ] as const).map(([key, label, hint]) => <label className="room-toggle" key={key}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" role="switch" disabled={key === 'lateJoin'} checked={options[key]} onChange={event => setOptions({ ...options, [key]: event.target.checked })}/></label>)}</div>
    <div className="room-form-actions"><button type="button" className="room-secondary" data-sound="close" onClick={onCancel}>Cancel</button><button className="room-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save settings' : 'Create room'}<ArrowRight size={18}/></button></div>
  </form>;
}

type Props = { path: string; profile: Profile | null; signedIn: boolean; ready: boolean; onLogin: () => void };
export function RoomPages({ path, profile, signedIn, ready, onLogin }: Props) {
  const code = /^\/room\/(\d{6})$/.exec(path)?.[1];
  const isNew = path === '/room/new';
  const uid = auth.currentUser?.uid;
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!code || !uid || !profile) return;
    return watchRoom(code, next => { setRoom(next); setLoading(false); }, message => { setNotice(message); setLoading(false); });
  }, [code, uid, profile]);

  async function perform(action: () => Promise<void>, success?: () => void) {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await action(); success?.(); }
    catch (error) { setNotice(roomError(error)); }
    finally { setBusy(false); }
  }

  function saveRoom(options: RoomOptions) {
    if (!uid) return;
    if (isNew) void perform(async () => { const created = await createRoom(uid, options); navigate(`/room/${created}`); });
    else if (code) void perform(() => changeRoom(code, uid, 'settings', options), () => setEditing(false));
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setNotice(`Couldn�t copy. Copy this manually: ${value}`); }
  }

  const activeCode = /already in room (\d{6})/.exec(notice)?.[1];
  const returnToRoom = activeCode && <button type="button" className="room-secondary" onClick={() => navigate(`/room/${activeCode}`)}>Return to room {activeCode}</button>;
  const back = <button className="room-back" type="button" onClick={() => navigate('/')}><ArrowLeft size={17}/>Back to lobby</button>;
  if (!ready || !signedIn || !profile || !uid) return <main className="room-page">{back}<section className="room-card room-empty"><h1>{!ready ? 'Just a moment�' : !signedIn ? 'Your party starts here' : 'Finish your player profile'}</h1><p>{!ready ? 'Checking your account.' : !signedIn ? 'Log in to join or create a room.' : 'Choose your name and avatar to continue.'}</p>{ready && !signedIn && <button type="button" className="room-primary" onClick={onLogin}>Log in to continue<ArrowRight size={18}/></button>}</section></main>;
  if (isNew || (editing && room && code)) return <main className="room-page room-creator"><div className="room-topline">{back}</div><div className="room-creator-layout"><RoomForm key={isNew ? 'new' : 'edit'} initial={isNew ? defaultRoomOptions : room!.options} editing={!isNew} busy={busy} onSubmit={saveRoom} onCancel={() => isNew ? navigate('/') : setEditing(false)}/></div><p className="room-notice" role="alert">{notice}</p>{returnToRoom}</main>;
  if (code && loading) return <main className="room-page">{back}<section className="room-card room-empty"><h1>Finding your room�</h1></section></main>;
  if (!code || !room || room.status === 'closed') return <main className="room-page">{back}<section className="room-card room-empty"><h1>Room not found</h1><p>{notice || 'Double-check your invite code or create a new room.'}</p><button className="room-primary" onClick={() => navigate('/room/new')}>Create a room</button></section></main>;
  if (!room.players[uid]) return <main className="room-page">{back}<section className="room-card room-empty"><h1>{room.options.name || 'Join this room?'}</h1><p>{Object.keys(room.players).length} / {room.options.capacity} players � {room.options.rounds} rounds � {formatDuration(room.options.timer)}{room.locked ? ' � Locked' : ''}</p>{room.status === 'waiting' && !room.locked && !room.banned.includes(uid) && Object.keys(room.players).length < room.options.capacity && <button className="room-primary" disabled={busy} onClick={() => void perform(() => joinRoom(code, uid), () => setJoined(true))}>{busy ? 'Joining�' : 'Join room'}<ArrowRight size={18}/></button>}<p className="room-notice" role="alert">{notice || (joined ? 'Joining�' : room.banned.includes(uid) ? 'You were removed from this room.' : room.status !== 'waiting' ? 'This match has started.' : room.locked ? 'Ask the host to unlock this room.' : Object.keys(room.players).length >= room.options.capacity ? 'This room is full.' : '')}</p>{returnToRoom}</section></main>;
  return <WaitingRoom room={room} uid={uid} code={code} duration={formatDuration(room.options.timer)} busy={busy} notice={notice} onEdit={() => setEditing(true)} onCopy={copy} onAction={(action, value) => perform(() => changeRoom(code, uid, action, value), action === 'leave' || action === 'close' ? () => navigate('/') : undefined)}/>;
}
