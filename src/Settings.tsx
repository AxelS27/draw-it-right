import { useEffect, useRef, useState, type FormEvent } from 'react';
import { setDoc } from 'firebase/firestore';
import { Check, LogOut, Palette, RotateCcw, Settings as SettingsIcon, Shuffle, UserRound, Volume2, X } from 'lucide-react';
import { AvatarPicker } from './AvatarPicker';
import { AvatarPreview } from './AvatarPreview';
import { SoundSettings } from './SoundSettings';
import { avatarOptions, defaultAvatar, profileRef, validUsername, type Avatar, type Profile } from './profile';
import './settings.css';

type Props = {
  uid: string;
  profile: Profile;
  onSave: (profile: Profile) => void;
  onClose: () => void;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
  logoutError: string;
};
const sections = {
  account: { title: 'Account', description: 'Your name and your account, all in one place.', Icon: UserRound },
  avatar: { title: 'Avatar', description: 'A little character. A lot of you.', Icon: Palette },
  sound: { title: 'Sound', description: 'Your music. Your effects. Your volume.', Icon: Volume2 },
};

export function Settings({ uid, profile, onSave, onClose, onLogout, loggingOut, logoutError }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [section, setSection] = useState<keyof typeof sections>('account');
  const [username, setUsername] = useState(profile.username);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [saved, setSaved] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingExit, setPendingExit] = useState<'close' | 'logout' | null>(null);
  const busy = saving || loggingOut;
  const valid = validUsername(username.trim());
  const dirty = username.trim() !== saved.username || (Object.keys(avatarOptions) as (keyof Avatar)[]).some(key => avatar[key] !== saved.avatar[key]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);

  function close() {
    if (savingRef.current || loggingOut) return;
    if (dirty) setPendingExit('close');
    else onClose();
  }

  async function confirmExit() {
    if (savingRef.current || loggingOut) return;
    if (pendingExit === 'close') { onClose(); return; }
    if (pendingExit !== 'logout') return;
    savingRef.current = true;
    try { await onLogout(); }
    finally { savingRef.current = false; setPendingExit(null); }
  }

  function changeAvatar(next: Avatar) {
    setAvatar(next);
    setMessage('');
    setPendingExit(null);
  }

  function randomize() {
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
    changeAvatar({ base: pick(avatarOptions.base), color: pick(avatarOptions.color), face: pick(avatarOptions.face), accessory: pick(avatarOptions.accessory) });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !dirty || savingRef.current || loggingOut || pendingExit) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    const next = { username: username.trim(), avatar };
    try {
      await setDoc(profileRef(uid), next);
      setSaved(next);
      setUsername(next.username);
      onSave(next);
      setMessage('Changes saved. Looking good!');
    } catch {
      setError('Couldn’t save changes. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); close(); }}>
    <aside className="settings-sidebar">
      <div className="settings-heading"><span><SettingsIcon size={21}/></span><h2 id="settings-title">Settings</h2></div>
      <p className="settings-nav-label">MAKE IT YOURS</p>
      <nav aria-label="Settings sections">
        {(Object.keys(sections) as (keyof typeof sections)[]).map(key => {
          const { title, Icon } = sections[key];
          return <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}><Icon size={19}/>{title}</button>;
        })}
      </nav>
      <div className="settings-identity"><AvatarPreview avatar={saved.avatar}/><div><strong>{saved.username}</strong><span>Your player profile</span></div></div>
    </aside>
    <form className="settings-main" onSubmit={event => void save(event)}>
      <header className="settings-header"><div><p>MAKE IT YOURS</p><h3>{sections[section].title}</h3><span>{sections[section].description}</span></div><button className="settings-close" type="button" aria-label="Close settings" disabled={busy} onClick={close}><X size={21}/></button></header>
      <div className="settings-body">
        {section === 'account' ? <>
          <div className="settings-profile-banner"><div className="settings-profile-avatar"><AvatarPreview avatar={avatar}/></div><div><strong>{username.trim() || 'Your name'}</strong><span>This is how friends see you in the game.</span><button type="button" onClick={() => setSection('avatar')}>Customize avatar <Palette size={14}/></button></div></div>
          <div className="settings-field"><label htmlFor="settings-username">Display name</label><input id="settings-username" value={username} disabled={busy} maxLength={16} autoComplete="nickname" aria-invalid={!valid} aria-describedby="settings-name-hint" onChange={event => { setUsername(event.target.value); setMessage(''); setPendingExit(null); }}/><p id="settings-name-hint">3-16 characters. Start with a letter; use letters, numbers or underscores.</p>{!valid && <p className="settings-error">Enter a valid display name before saving.</p>}</div>
          <div className="settings-logout"><div><strong>Log out</strong><p>You can log back in with Google anytime.</p></div><button type="button" disabled={busy} onClick={() => { setError(''); setPendingExit('logout'); }}><LogOut size={17}/>{loggingOut ? 'Logging out…' : 'Log out'}</button></div>
        </> : section === 'sound' ? <SoundSettings/> : <div className="settings-avatar-layout"><div className="settings-avatar-preview"><AvatarPreview avatar={avatar}/><strong>{username.trim()}</strong><div><button type="button" disabled={busy} onClick={randomize}><Shuffle size={16}/>Randomize</button><button type="button" disabled={busy} onClick={() => changeAvatar(defaultAvatar)}><RotateCcw size={16}/>Reset</button></div></div><AvatarPicker avatar={avatar} disabled={busy} onChange={changeAvatar}/></div>}
      </div>
      <footer className="settings-footer">
        <div aria-live="polite">{pendingExit ? <p>{pendingExit === 'logout' ? (dirty ? 'Log out and discard unsaved account changes?' : 'Log out of your account?') : 'Discard your unsaved account changes?'}</p> : error || logoutError ? <p className="settings-error" role="alert">{error || logoutError}</p> : message ? <p className="settings-success"><Check size={16}/>{message}</p> : <p>{dirty ? 'You have unsaved account changes.' : section === 'sound' ? 'These preferences apply to this device.' : 'All set. Make yourself at home.'}</p>}</div>
        <div className="settings-footer-actions">{pendingExit ? <><button type="button" className="settings-secondary" disabled={busy} onClick={() => setPendingExit(null)}>Keep editing</button><button type="button" className="settings-discard" disabled={busy} onClick={() => void confirmExit()}>{loggingOut ? 'Logging out…' : pendingExit === 'logout' ? 'Log out' : 'Discard changes'}</button></> : <><button className="settings-secondary" type="button" disabled={busy} onClick={close}>Close</button>{(section !== 'sound' || dirty) && <button className="settings-save" type="submit" disabled={!valid || !dirty || busy}>{saving ? 'Saving…' : 'Save changes'}</button>}</>}</div>
      </footer>
    </form>
  </dialog>;
}
