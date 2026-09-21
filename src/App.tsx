import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Pencil, Sparkles, X } from 'lucide-react';

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.7 2.9-4.3 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4H3v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4l3.4 2.7c.8-2.3 3-4 5.6-4Z"/></svg>;
}

export default function App() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState(false);

  function openLogin(roomCode: string | null) {
    setPendingCode(roomCode);
    setAuthNotice(false);
    dialog.current?.showModal();
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter a 6-digit room code.');
      return;
    }
    setError('');
    openLogin(code);
  }

  return <div className="game-world">
    <div className="background-art" aria-hidden="true"><svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="currentColor" strokeWidth="2"><path d="m-90 300 280-310 105 95L15 395Z M154 32l105 94M-10 372l69-23-43-42"/><path d="M1090-70q-85 185 108 206t147 208q-50 99 126 106"/><path d="m1000 430 34-96 34 96 97 33-97 34-34 96-34-96-96-34Z"/><path d="m173 519 7-84 78 54q54-15 94 4l74-51-4 94q50 109-106 118-164 6-143-135Z M237 548v13m105-13v13m-71 26 20 14 20-14m-128-10-54-12m55 41-54 9m276-38 53-13m-53 42 52 7"/><circle cx="1363" cy="751" r="170"/><circle cx="1363" cy="751" r="120"/><path d="m536 878 105-182 106 182Z M797 115l13-31 13 31 31 13-31 13-13 31-13-31-31-13Z"/></g></svg><span className="background-star star-one">✦</span><span className="background-star star-two">✦</span></div>
    <header className="header"><a className="brand" href="#" aria-label="Draw It Right! home"><span className="brand-icon"><Pencil size={21}/></span><span>draw it right!</span></a><button className="login-link" onClick={() => openLogin(null)}>Log in <ArrowRight size={15}/></button></header>
    <main className="join-main"><section className="join-content" aria-labelledby="game-title"><div className="game-logo"><span className="logo-pencil" aria-hidden="true"><Pencil/></span><h1 id="game-title">draw it<span>right!</span></h1><Sparkles className="logo-spark" aria-hidden="true"/></div><form className="join-form" onSubmit={joinRoom} noValidate><label className="sr-only" htmlFor="room-code">Room code</label><div className={`code-field${error ? ' has-error' : ''}`}><input id="room-code" name="room-code" placeholder="Enter a room code" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={6} value={code} aria-invalid={Boolean(error)} aria-describedby={error ? 'code-error' : undefined} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}/><button type="submit">Join <ArrowRight size={19}/></button></div><p className="code-error" id="code-error" role="alert">{error}</p></form></section></main>
    <footer><span>© {new Date().getFullYear()} Draw It Right!</span><span>Made for your people.</span></footer>
    <dialog ref={dialog} className="login-dialog" aria-labelledby="login-title" aria-describedby="login-description" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><button className="dialog-close" aria-label="Close login" onClick={() => dialog.current?.close()}><X size={21}/></button><span className="dialog-icon"><Pencil size={27}/></span><h2 id="login-title">{pendingCode ? 'Log in to join' : 'Welcome to the party'}</h2><p id="login-description">{pendingCode ? <>Room <strong>{pendingCode}</strong></> : 'Continue with your Google account.'}</p><button className="google-button" onClick={() => setAuthNotice(true)}><GoogleIcon/>Continue with Google<ArrowRight size={17}/></button><p className="auth-notice" role="status">{authNotice ? 'Google login is not connected yet. No account has been created or room joined.' : 'Preview only. Google login is not connected yet.'}</p></dialog>
  </div>;
}
