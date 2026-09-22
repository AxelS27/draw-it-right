import { useEffect, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

function errorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';
  switch (code) {
    case 'auth/popup-closed-by-user': return 'Sign-in was cancelled. Try again when you’re ready.';
    case 'auth/cancelled-popup-request': return 'Another sign-in was opened. Please try again.';
    case 'auth/popup-blocked': return 'Allow popups for this site, then try again.';
    case 'auth/unauthorized-domain': return 'This domain is not authorized for login. Add it in Firebase Authentication settings.';
    case 'auth/operation-not-allowed': return 'Google login is not enabled yet. Enable it in Firebase Authentication.';
    case 'auth/network-request-failed': return 'Couldn’t connect. Check your internet and try again.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/account-exists-with-different-credential': return 'This email uses another sign-in method. Use that method to access your account.';
    default: return 'Something went wrong. Please try again.';
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  useEffect(() => onAuthStateChanged(auth, nextUser => {
    setUser(nextUser);
    setReady(true);
  }, error => {
    setError(errorMessage(error));
    setReady(true);
  }), []);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    user, ready, busy, error,
    clearError: () => setError(''),
    login: () => run(() => signInWithPopup(auth, googleProvider)),
    logout: () => run(() => signOut(auth)),
  };
}
