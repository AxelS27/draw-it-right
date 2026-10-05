import { useEffect, useState } from 'react';
import { matchApi, matchRequest, type Wallet } from './match-api';

export function useWallet(uid: string | undefined) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  useEffect(() => {
    setWallet(null);
    if (!uid || !matchApi) return;
    let active = true;
    const load = () => { void matchRequest<Wallet>('/wallet').then(value => { if (active) setWallet(value); }).catch(() => { if (active) setWallet(null); }); };
    load();
    window.addEventListener('wallet-updated', load);
    return () => { active = false; window.removeEventListener('wallet-updated', load); };
  }, [uid]);
  return wallet;
}
