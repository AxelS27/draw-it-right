import { doc, getFirestore } from 'firebase/firestore';
import { auth } from './firebase';

export const colors = { mint: '#9cd7bd', gold: '#f5cf78', rose: '#eab5bf', blue: '#9bc8e8', lilac: '#c5b3e6', peach: '#f3b58f', cream: '#f4e4bc', teal: '#71c8c4' };
const choices = {
  base: ['bean', 'cat', 'bear', 'bunny', 'blob', 'robot'],
  color: ['mint', 'gold', 'rose', 'blue', 'lilac', 'peach', 'cream', 'teal'],
  face: ['smile', 'wink', 'happy', 'surprised', 'sleepy', 'cheeky'],
  accessory: ['none', 'glasses', 'shades', 'crown', 'bow', 'headphones'],
} as const;
export type Avatar = { [K in keyof typeof choices]: typeof choices[K][number] };
export const avatarOptions: { [K in keyof Avatar]: readonly Avatar[K][] } = choices;
export type Profile = { username: string; avatar: Avatar };
export const defaultAvatar: Avatar = { base: 'bean', color: 'mint', face: 'smile', accessory: 'none' };
export const validUsername = (value: string) => /^[A-Za-z][A-Za-z0-9_]{2,15}$/.test(value);
export const profileRef = (uid: string) => doc(getFirestore(auth.app), 'profiles', uid);

export function parseProfile(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.username !== 'string' || !validUsername(data.username) || !data.avatar || typeof data.avatar !== 'object') return null;
  const a = data.avatar as Record<string, unknown>;
  if (!(Object.keys(avatarOptions) as (keyof Avatar)[]).every(key => typeof a[key] === 'string' && (avatarOptions[key] as readonly string[]).includes(a[key] as string))) return null;
  return { username: data.username, avatar: a as Avatar };
}
