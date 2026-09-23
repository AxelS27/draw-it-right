import { useEffect, useRef, useState, type FormEvent } from 'react';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { AvatarPreview } from './AvatarPreview';
import { AvatarPicker } from './AvatarPicker';
import { Shuffle, RotateCcw } from 'lucide-react';
import { avatarOptions, defaultAvatar, parseProfile, profileRef, validUsername, type Avatar, type Profile } from './profile';
import './profile.css';

type Props = { uid: string; onProfile: (profile: Profile) => void; onLogout: () => Promise<void>; loggingOut: boolean };

export function ProfileSetup({ uid, onProfile, onLogout, loggingOut }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<'loading' | 'required' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(defaultAvatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const report = useRef(onProfile);
  report.current = onProfile;

  useEffect(() => {
    setStatus('loading');
    // Never treat a cached missing document or a read failure as a new account.
    const unsubscribe = onSnapshot(profileRef(uid), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      const profile = parseProfile(snapshot.data());
      if (profile) {
        report.current(profile);
        setStatus('ready');
      } else setStatus('required');
    }, () => {
      setError('Couldn’t load your profile. Check your connection and Firestore access, then retry.');
      setStatus('error');
    });
    return unsubscribe;
  }, [uid, attempt]);

  useEffect(() => {
    if (status === 'ready') { dialog.current?.close(); return; }
    dialog.current?.showModal();
  }, [status]);

  useEffect(() => {
    if (status !== 'required') return;
    const previous = window.location.hash;
    const keepSetup = () => {
      if (window.location.hash !== '#setup') history.replaceState(null, '', `${location.pathname}${location.search}#setup`);
    };
    keepSetup();
    window.addEventListener('hashchange', keepSetup);
    return () => {
      window.removeEventListener('hashchange', keepSetup);
      if (location.hash === '#setup') history.replaceState(null, '', `${location.pathname}${location.search}${previous === '#setup' ? '' : previous}`);
    };
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validUsername(username.trim()) || savingRef.current) return;
    if (step === 1) { setStep(2); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const updatedProfile = { username: username.trim(), avatar };
      await setDoc(profileRef(uid), updatedProfile);
      // The server-confirmed snapshot completes onboarding, not an optimistic write.
    } catch {
      setError('Couldn’t save your profile. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function randomize() {
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
    setAvatar({ base: pick(avatarOptions.base), color: pick(avatarOptions.color), face: pick(avatarOptions.face), accessory: pick(avatarOptions.accessory) });
  }

  const isFormOpen = status === 'required';

  return <dialog ref={dialog} className="login-dialog setup-dialog" aria-labelledby="setup-title" onCancel={event => event.preventDefault()}>
    <div className="setup-content">
    <div className="setup-decoration" aria-hidden="true"><span>✦</span><span>✳</span><span>✦</span></div>
    <h2 id="setup-title">{status === 'loading' ? 'Loading…' : status === 'error' ? 'Try again' : step === 1 ? 'Your username' : 'Your character'}</h2>
    {status === 'loading' && <p role="status">Checking your account. If this takes a while, check your connection.</p>}
    {status === 'error' && <><p role="alert">{error}</p><button className="google-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button></>}
    {isFormOpen && <form id="profile-setup-form" onSubmit={event => void submit(event)}>
      <ol className="setup-steps" aria-label="Profile setup">
        <li><button type="button" aria-label="Step 1: Username" aria-current={step === 1 ? 'step' : undefined} disabled={saving} onClick={() => setStep(1)}>1</button></li>
        <li><button type="button" aria-label="Step 2: Character" aria-current={step === 2 ? 'step' : undefined} disabled={saving || !validUsername(username.trim())} onClick={() => setStep(2)}>2</button></li>
      </ol>
      {step === 1 ? <div className="username-step"><div className="setup-mascot"><AvatarPreview avatar={avatar}/></div><div className="username-field"><label className="sr-only" htmlFor="username">Username</label><input id="username" autoFocus value={username} maxLength={16} autoComplete="nickname" placeholder="DoodleBuddy" aria-describedby="username-hint" onChange={event => setUsername(event.target.value)}/><p id="username-hint">3-16 characters: letters, numbers, _. Start with a letter.</p></div></div> : <div className="character-step">
        <div className="avatar-preview">
          <AvatarPreview avatar={avatar}/><strong>{username.trim()}</strong>
          <div className="avatar-actions" role="group" aria-label="Character actions">
            <button type="button" aria-label="Randomize character" title="Randomize" disabled={saving} onClick={randomize}><Shuffle size={17}/></button>
            <button type="button" aria-label="Reset character" title="Reset" disabled={saving} onClick={() => setAvatar(defaultAvatar)}><RotateCcw size={17}/></button>
          </div>
        </div>
        <AvatarPicker avatar={avatar} disabled={saving} onChange={setAvatar}/>
      </div>}
      {error && <p className="setup-error" role="alert">{error}</p>}
    </form>}
    </div>
    <div className="setup-footer">
      {isFormOpen && <button className="setup-primary" form="profile-setup-form" disabled={!validUsername(username.trim()) || saving} type="submit">{saving ? 'Saving…' : step === 1 ? 'Next' : 'Save'}</button>}
      <div className="setup-footer-links">
        <button className="setup-back" type="button" style={{ visibility: isFormOpen && step === 2 ? 'visible' : 'hidden' }} disabled={saving || step !== 2} onClick={() => setStep(1)}>Back</button>
        <button className="setup-back" disabled={saving || loggingOut} onClick={() => void onLogout()}>{loggingOut ? 'Logging out…' : 'Log out'}</button>
      </div>
    </div>
  </dialog>;
}
