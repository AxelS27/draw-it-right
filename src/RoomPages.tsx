import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Minus, Paintbrush, Plus, Settings2, Sparkles, Trophy, Users } from 'lucide-react';
import { AvatarPreview } from './AvatarPreview';
import type { Profile } from './profile';
import { navigate } from './navigation';
import { WaitingRoom } from './WaitingRoom';
import './room.css';

export type RoomOptions = { name: string; rounds: number; timer: number; capacity: number; doublePoints: boolean; reactions: boolean; lateJoin: boolean };
const defaults: RoomOptions = { name: '', rounds: 7, timer: 30, capacity: 20, doublePoints: true, reactions: true, lateJoin: false };
const roomLimits = {
  rounds: { min: 1, max: 10, step: 1 },
  timer: { min: 10, max: 300, step: 10 },
  capacity: { min: 2, max: 40, step: 1 },
};
function validCount(value: unknown, { min, max }: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes === 0 ? `${seconds} sec` : `${minutes} min${remainder ? ` ${remainder} sec` : ''}`;
}
const previewCode = '123456';
const storageKey = 'draw-it-right:room-preview';
function readRoom(): RoomOptions | null {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (!data || typeof data !== 'object') return null;
    const room = data as Record<string, unknown>;
    if (typeof room.name !== 'string' || room.name.length > 32 || !validCount(room.rounds, roomLimits.rounds) || !validCount(room.timer, roomLimits.timer) || !validCount(room.capacity, roomLimits.capacity) || typeof room.doublePoints !== 'boolean' || typeof room.reactions !== 'boolean' || typeof room.lateJoin !== 'boolean') return null;
    return { name: room.name, rounds: room.rounds, timer: room.timer, capacity: room.capacity, doublePoints: room.doublePoints, reactions: room.reactions, lateJoin: room.lateJoin };
  } catch { return null; }
}

function RoomStepper({ label, value, limits, display = String(value), hint, onChange }: {
  label: string; value: number; limits: { min: number; max: number; step: number }; display?: string; hint: string; onChange: (value: number) => void;
}) {
  return <div className="room-stepper">
    <div className="room-stepper-controls">
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= limits.min} onClick={() => onChange(Math.max(limits.min, value - limits.step))}><Minus size={18} aria-hidden="true"/></button>
      <output aria-label={label} aria-live="polite" aria-atomic="true">{display}</output>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= limits.max} onClick={() => onChange(Math.min(limits.max, value + limits.step))}><Plus size={18} aria-hidden="true"/></button>
    </div>
    <p>{hint}</p>
  </div>;
}

function RoomForm({ initial, editing, onSubmit, onCancel }: { initial: RoomOptions; editing: boolean; onSubmit: (room: RoomOptions) => void; onCancel: () => void }) {
  const [options, setOptions] = useState(initial);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ ...options, name: options.name.trim() });
  }
  return <form className="room-card room-form" onSubmit={submit}>
    <div className="room-card-heading"><span className="room-icon"><Settings2 size={22}/></span><div><h2>{editing ? 'Edit your room' : 'Make it your kind of party'}</h2><p>A few little choices before the big doodles.</p></div></div>
    <label className="room-field">Room name <span>Optional</span><input value={options.name} maxLength={32} placeholder="The doodle club" onChange={event => setOptions({ ...options, name: event.target.value })}/></label>
    <div className="room-form-grid">
      <fieldset className="room-choice"><legend><Trophy size={16}/>Rounds</legend><RoomStepper label="rounds" value={options.rounds} limits={roomLimits.rounds} hint="1-10 rounds" onChange={rounds => setOptions({ ...options, rounds })}/></fieldset>
      <fieldset className="room-choice"><legend><Clock3 size={16}/>Drawing time</legend><RoomStepper label="drawing time" value={options.timer} display={formatDuration(options.timer)} limits={roomLimits.timer} hint="10 sec-5 min · 10 sec steps" onChange={timer => setOptions({ ...options, timer })}/></fieldset>
    </div>
    <fieldset className="room-choice room-capacity"><legend><Users size={16}/>Maximum players</legend><RoomStepper label="maximum players" value={options.capacity} limits={roomLimits.capacity} hint="2-40 players" onChange={capacity => setOptions({ ...options, capacity })}/></fieldset>
    <div className="room-toggles">{([
      ['doublePoints', 'Double-point finale', 'Make the last round count twice.'],
      ['reactions', 'Emote reactions', 'Let players react with a little personality.'],
      ['lateJoin', 'Allow late joining', 'Preview preference. Joining rules come later.'],
    ] as const).map(([key, label, hint]) => <label className="room-toggle" key={key}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" role="switch" checked={options[key]} onChange={event => setOptions({ ...options, [key]: event.target.checked })}/></label>)}</div>
    <div className="room-form-actions"><button type="button" className="room-secondary" onClick={onCancel}>Cancel</button><button className="room-primary" type="submit">{editing ? 'Save settings' : 'Create preview room'}<ArrowRight size={18}/></button></div>
  </form>;
}

type Props = { path: string; profile: Profile | null; signedIn: boolean; ready: boolean; onLogin: () => void };
export function RoomPages({ path, profile, signedIn, ready, onLogin }: Props) {
  const [room, setRoom] = useState(readRoom);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const isNew = path === '/room/new';
  const validPath = isNew || path === `/room/${previewCode}`;
  const options = room ?? defaults;

  function saveRoom(next: RoomOptions) {
    setRoom(next);
    setNotice('');
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setNotice('Browser storage is unavailable. This preview will reset when you refresh.'); }
    setEditing(false);
    navigate(`/room/${previewCode}`);
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied. This is a local preview, not a live invite.`); }
    catch { setNotice(`Couldn’t copy. Copy this manually: ${value}`); }
  }

  const back = <button className="room-back" type="button" onClick={() => navigate('/')}><ArrowLeft size={17}/>Back to lobby</button>;
  if (!ready || !signedIn || !profile) return <main className="room-page">{back}<section className="room-card room-empty"><span className="room-icon"><Users/></span><h1>{!ready ? 'Just a moment…' : !signedIn ? 'Your party starts here' : 'Finish your player profile'}</h1><p>{!ready ? 'Checking your account.' : !signedIn ? 'Log in to set up your room preview.' : 'Choose your name and avatar to continue.'}</p>{ready && !signedIn && <button type="button" className="room-primary" onClick={onLogin}>Log in to continue<ArrowRight size={18}/></button>}</section></main>;
  if (!validPath || (!isNew && !room)) return <main className="room-page">{back}<section className="room-card room-empty"><h1>No preview room here yet</h1><p>Preview rooms only exist in this browser tab. Create one to explore the waiting room.</p><button type="button" className="room-primary" onClick={() => navigate('/room/new')}>Set up a room<ArrowRight size={18}/></button></section></main>;

  return <>
    {!isNew && <WaitingRoom profile={profile} options={options} code={previewCode} duration={formatDuration(options.timer)} hidden={editing} onEdit={() => { setEditing(true); setNotice(''); }} notice={notice} onCopy={copy}/>}
    {(isNew || editing) && <main className="room-page">
      <div className="room-topline">{back}<span className="room-preview-badge"><Sparkles size={14}/>FRONTEND PREVIEW</span></div>
      <header className="room-title"><div><p className="room-eyebrow">YOUR ROOM, YOUR RULES</p><h1>{isNew ? 'Start a little drawing party.' : 'A little fine-tuning.'}</h1><p>Pick the rules. Bring your people. Make a little mess.</p></div><span className="room-title-art" aria-hidden="true"><Paintbrush size={38}/></span></header>
      <div className="room-layout">
        <RoomForm key={isNew ? 'new' : 'edit'} initial={isNew ? defaults : options} editing={!isNew} onSubmit={saveRoom} onCancel={() => isNew ? navigate('/') : setEditing(false)}/>
        <aside className="room-side"><section className="room-card room-guide"><span className="room-icon"><Paintbrush size={25}/></span><h2>Same prompt.<br/>Different masterpieces.</h2><ol><li><span>1</span>Everyone gets the same object to draw.</li><li><span>2</span>Draw it your way before time runs out.</li><li><span>3</span>Let AI judge, then celebrate the results.</li></ol><div className="room-guide-avatar"><AvatarPreview avatar={profile.avatar}/><p>Hosted by<strong>{profile.username}</strong></p></div></section><p className="room-preview-note"><Sparkles size={16}/>Frontend preview. Settings stay in this tab; chat, invites and player actions aren’t live.</p></aside>
      </div>
      <p className="room-notice" role="status">{notice}</p>
    </main>}
  </>;
}
