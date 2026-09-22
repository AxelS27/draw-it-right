import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Public browser configuration, not server credentials.
const app = initializeApp({
  apiKey: 'AIzaSyBlplPATii3YsaMQ-H0TXF8tMUiiwWrYbA',
  authDomain: 'draw-it-right.firebaseapp.com',
  projectId: 'draw-it-right',
  storageBucket: 'draw-it-right.firebasestorage.app',
  messagingSenderId: '919477056445',
  appId: '1:919477056445:web:3d72a51dc6c63843d9d8d4',
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
