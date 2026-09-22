import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Paintbrush, Pencil, ShoppingBag, Sparkles, X } from 'lucide-react';

import { useAuth } from './useAuth';
import { ProfileSetup } from './ProfileSetup';
import { AvatarPreview } from './AvatarPreview';
import type { Profile } from './profile';

const roomIntentKey = 'draw-it-right:room-intent';
function readRoomIntent(): string {
  try {
    const value = sessionStorage.getItem(roomIntentKey) ?? '';
    return /^\d{6}$/.test(value) ? value : '';
  } catch { return ''; }
}
function saveRoomIntent(value: string | null) {
  try {
    if (value) sessionStorage.setItem(roomIntentKey, value);
    else sessionStorage.removeItem(roomIntentKey);
  } catch { /* In-memory state still works when storage is unavailable. */ }
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.7 2.9-4.3 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4H3v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4l3.4 2.7c.8-2.3 3-4 5.6-4Z"/></svg>;
}

export default function App() {
  const dialog = useRef<HTMLDialogElement>(null);
  const shopDialog = useRef<HTMLDialogElement>(null);
  const account = useAuth();
  const [savedProfile, setSavedProfile] = useState<{ uid: string; data: Profile } | null>(null);
  const profile = savedProfile?.uid === account.user?.uid ? savedProfile?.data : null;
  const [code, setCode] = useState(readRoomIntent);
  const [error, setError] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(() => readRoomIntent() || null);

  async function login() {
    if (await account.login()) dialog.current?.close();
  }

  async function logout() {
    if (await account.logout()) {
      saveRoomIntent(null);
      setPendingCode(null);
      setCode('');
    }
  }

  function openLogin(roomCode: string | null) {
    if (roomCode) setPendingCode(roomCode);
    account.clearError();
    if (roomCode) saveRoomIntent(roomCode);
    dialog.current?.showModal();
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter a 6-digit room code.');
      return;
    }
    setError('');
    saveRoomIntent(code);
    setPendingCode(code);
    if (!account.user) openLogin(code);
  }

  return <div className="game-world">
    <div className="background-art" aria-hidden="true"><svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="currentColor" strokeWidth="2"><path d="m-90 300 280-310 105 95L15 395Z M154 32l105 94M-10 372l69-23-43-42"/><path d="M1090-70q-85 185 108 206t147 208q-50 99 126 106"/><path d="m1000 430 34-96 34 96 97 33-97 34-34 96-34-96-96-34Z"/><path d="m173 519 7-84 78 54q54-15 94 4l74-51-4 94q50 109-106 118-164 6-143-135Z M237 548v13m105-13v13m-71 26 20 14 20-14m-128-10-54-12m55 41-54 9m276-38 53-13m-53 42 52 7"/><circle cx="1363" cy="751" r="170"/><circle cx="1363" cy="751" r="120"/><path d="m536 878 105-182 106 182Z M797 115l13-31 13 31 31 13-31 13-13 31-13-31-31-13Z"/></g></svg><span className="background-star star-one">✦</span><span className="background-star star-two">✦</span></div>
    <div className="landing-stickers" aria-hidden="true">
      <div className="doodle-card cat-card"><span className="tape"/><svg viewBox="0 0 160 140" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M34 62 30 24 63 43Q83 36 103 44L132 23 128 66Q144 116 83 119 22 119 34 62Z"/><path d="M59 70v7m43-7v7M72 91l10 8 11-8M34 87 14 82m19 17-21 4m116-16 20-5m-20 17 21 4"/></svg><span>nailed it. probably.</span></div>
      <div className="doodle-card brush-card"><span className="tape"/><Paintbrush/><span>make a little mess.</span></div>
      <svg className="orbit-doodle" viewBox="0 0 180 140" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><ellipse cx="90" cy="70" rx="77" ry="25" transform="rotate(-30 90 70)"/><circle cx="90" cy="70" r="40"/><path d="m150 15 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z"/></svg>
      <span className="little-spark spark-pink">✳</span><span className="little-spark spark-gold">✦</span>
    </div>
    <header className="header"><a className="brand" href="#" aria-label="Draw It Right! home"><span className="brand-icon"><Pencil size={21}/></span><span>draw it right!</span></a><nav className="header-actions" aria-label="Main navigation"><button className="coin-balance" aria-label="0 coins. View details" onClick={() => shopDialog.current?.showModal()}><span className="gold-coin" aria-hidden="true"><span>★</span></span><span>0</span></button><button className="shop-link" onClick={() => shopDialog.current?.showModal()}><ShoppingBag size={18}/><span>Shop</span></button><span className="nav-divider" aria-hidden="true"/>{account.user ? <>{profile && <span className="account-avatar"><AvatarPreview avatar={profile.avatar}/></span>}<span className="account-name" title={profile?.username ?? 'Player'}>{profile?.username ?? 'Player'}</span><button className="login-link" disabled={account.busy} onClick={() => void logout()}>{account.busy ? 'Please wait…' : 'Log out'}</button></> : <button className="login-link" disabled={!account.ready || account.busy} onClick={() => openLogin(null)}>{account.ready ? 'Log in' : 'Loading…'}<ArrowRight size={15}/></button>}</nav></header>
    <main className="join-main"><section className="join-content" aria-labelledby="game-title"><div className="game-logo"><span className="logo-pencil" aria-hidden="true"><Pencil/></span><h1 id="game-title">draw it<span>right!</span></h1><Sparkles className="logo-spark" aria-hidden="true"/></div><form className="join-form" onSubmit={joinRoom} noValidate><label className="sr-only" htmlFor="room-code">Room code</label><div className={`code-field${error ? ' has-error' : ''}`}><input id="room-code" name="room-code" placeholder="Enter a room code" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={6} value={code} aria-invalid={Boolean(error)} aria-describedby={error ? 'code-error' : undefined} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}/><button type="submit" disabled={!account.ready || account.busy}>Join <ArrowRight size={19}/></button></div><p className="code-error" id="code-error" role="alert">{error}</p></form>{account.user && <p className="session-notice" role="status">You’re signed in! {pendingCode ? <>Room {pendingCode} is saved for later. </> : ''}{profile ? 'Your profile is ready. Room joining isn’t available yet.' : 'Let’s finish your profile first.'}</p>}{account.error && <p className="session-notice" role="alert">{account.error}</p>}</section></main>
    {account.user && <ProfileSetup key={account.user.uid} uid={account.user.uid} onProfile={data => setSavedProfile({ uid: account.user!.uid, data })} onLogout={logout} loggingOut={account.busy}/>}
    <footer><span>© {new Date().getFullYear()} Draw It Right!</span><span>Made for your people.</span></footer>
    <dialog ref={shopDialog} className="login-dialog shop-dialog" aria-labelledby="shop-title" aria-describedby="shop-description" onClick={event => { if (event.target === event.currentTarget) shopDialog.current?.close(); }}>
      <button className="dialog-close" aria-label="Close shop" onClick={() => shopDialog.current?.close()}><X size={21}/></button>
      <span className="dialog-icon"><ShoppingBag size={27}/></span><span className="shop-eyebrow">A LITTLE EXTRA YOU</span><h2 id="shop-title">The doodle shop</h2><p id="shop-description">A sneak peek at a more colorful you. The shop and coins aren’t available yet.</p>
      <div className="shop-preview" aria-label="Cosmetic concepts"><div><Pencil/><span>Pencils</span></div><div><Sparkles/><span>Extras</span></div><div><Paintbrush/><span>Colors</span></div></div>
      <p className="shop-footnote">Preview only. No purchases or coin balance.</p><button className="google-button" onClick={() => shopDialog.current?.close()}>Back to the party<ArrowRight size={17}/></button>
    </dialog>
    <dialog ref={dialog} className="login-dialog auth-dialog" aria-labelledby="login-title" aria-describedby="login-description" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><button className="dialog-close" aria-label="Close login" onClick={() => dialog.current?.close()}><X size={21}/></button><span className="dialog-icon"><Pencil size={27}/></span><h2 id="login-title">{pendingCode ? 'Log in to join' : 'Welcome to the party'}</h2><p id="login-description">{pendingCode ? <>Room <strong>{pendingCode}</strong></> : 'Continue with your Google account.'}</p><button className="google-button" disabled={!account.ready || account.busy} aria-busy={account.busy} onClick={() => void login()}><GoogleIcon/>{account.busy ? 'Signing in…' : 'Continue with Google'}<ArrowRight size={17}/></button><p className="auth-notice" role="status">{account.error || (account.busy ? 'Finish signing in in the Google popup.' : 'Sign in securely with your Google account.')}</p></dialog>
  </div>;
}
