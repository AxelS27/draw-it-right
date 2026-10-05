import { FirebaseError } from 'firebase/app';
import { addDoc, collection, doc, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { auth } from './firebase';
import { parseProfile, profileRef, type Profile } from './profile';
import { nextHost, remainingJoinOrder } from './room-order';

export type RoomOptions = { name: string; rounds: number; timer: number; capacity: number; doublePoints: boolean; reactions: boolean; lateJoin: boolean };
export const defaultRoomOptions: RoomOptions = { name: '', rounds: 7, timer: 30, capacity: 20, doublePoints: true, reactions: true, lateJoin: false };
export type Room = { host: string; status: 'waiting' | 'started' | 'closed'; locked: boolean; options: RoomOptions; players: Record<string, Profile>; banned: string[]; joinOrder: string[] };
const roomRef = (code: string) => doc(getFirestore(auth.app), 'rooms', code);
const membershipRef = (uid: string) => doc(getFirestore(auth.app), 'roomMemberships', uid);
const messagesRef = (code: string) => collection(roomRef(code), 'messages');
const reactionsRef = (code: string) => collection(roomRef(code), 'reactions');
export const reactionSymbols = ['👋', '😂', '🔥', '❤️', '🎉'] as const;
export type ReactionSymbol = typeof reactionSymbols[number];
export type LiveMessage = { id: string; sender: string; text: string };
const validCode = (code: string) => /^\d{6}$/.test(code);
const codeCandidate = () => String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');

export function parseRoom(data: unknown): Room | null {
  if (!data || typeof data !== 'object') return null;
  const room = data as Record<string, unknown>;
  if (typeof room.host !== 'string' || !['waiting', 'started', 'closed'].includes(String(room.status)) || typeof room.locked !== 'boolean' || !room.players || typeof room.players !== 'object' || !room.options || typeof room.options !== 'object') return null;
  const options = room.options as Record<string, unknown>;
  if (typeof options.name !== 'string' || options.name.length > 32 || !Number.isInteger(options.rounds) || (options.rounds as number) < 1 || (options.rounds as number) > 10 || !Number.isInteger(options.timer) || (options.timer as number) < 10 || (options.timer as number) > 300 || (options.timer as number) % 10 !== 0 || !Number.isInteger(options.capacity) || (options.capacity as number) < 2 || (options.capacity as number) > 40 || ['doublePoints', 'reactions', 'lateJoin'].some(key => typeof options[key] !== 'boolean')) return null;
  const players = room.players as Record<string, unknown>;
  if ((room.status !== 'closed' && !players[room.host]) || !Array.isArray(room.banned) || Object.keys(players).length > (options.capacity as number) || Object.values(players).some(player => !parseProfile(player))) return null;
  const joinOrder = Array.isArray(room.joinOrder) && room.joinOrder.length === Object.keys(players).length && room.joinOrder.every(id => typeof id === 'string' && id in players) && new Set(room.joinOrder).size === room.joinOrder.length
    ? room.joinOrder as string[] : Object.keys(players);
  return { ...room, joinOrder } as Room;
}

export function roomError(error: unknown): string {
  if (error instanceof Error && !(error instanceof FirebaseError)) return error.message;
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') return 'Room unavailable or action not allowed. Refresh and try again.';
    if (error.code === 'unavailable') return 'Connection lost. Check your internet and retry.';
  }
  return 'Couldn’t update the room. Please try again.';
}

type RoomTransaction = Parameters<Parameters<typeof runTransaction>[1]>[0];

async function availableMembership(uid: string, transaction: RoomTransaction): Promise<void> {
  const membership = await transaction.get(membershipRef(uid));
  if (!membership.exists()) return;
  const code: unknown = membership.data().code;
  if (typeof code !== 'string' || !validCode(code)) throw new Error('Your room membership needs support. Please try again later.');
  const snapshot = await transaction.get(roomRef(code));
  const room = snapshot.exists() ? parseRoom(snapshot.data()) : null;
  if (room && room.status !== 'closed' && room.players[uid]) throw new Error(`You’re already in room ${code}. Leave or close it before joining another.`);
}

async function currentProfile(uid: string, transaction: RoomTransaction): Promise<Profile> {
  const snapshot = await transaction.get(profileRef(uid));
  const profile = snapshot.exists() ? parseProfile(snapshot.data()) : null;
  if (!profile) throw new Error('Finish your profile before joining a room.');
  return profile;
}

export async function createRoom(uid: string, options: RoomOptions): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = codeCandidate();
    const created = await runTransaction(getFirestore(auth.app), async transaction => {
      const ref = roomRef(code);
      const existing = await transaction.get(ref);
      if (existing.exists()) return false;
      await availableMembership(uid, transaction);
      const profile = await currentProfile(uid, transaction);
      transaction.set(ref, { host: uid, status: 'waiting', locked: false, options, players: { [uid]: profile }, banned: [], joinOrder: [uid] } satisfies Room);
      transaction.set(membershipRef(uid), { code });
      return true;
    });
    if (created) return code;
  }
  throw new Error('Couldn’t find an available room code. Please retry.');
}

export async function joinRoom(code: string, uid: string): Promise<void> {
  if (!validCode(code)) throw new Error('Enter a 6-digit room code.');
  await runTransaction(getFirestore(auth.app), async transaction => {
    const ref = roomRef(code);
    const snapshot = await transaction.get(ref);
    const room = snapshot.exists() ? parseRoom(snapshot.data()) : null;
    if (!room || room.status === 'closed') throw new Error('Room not found. Double-check the code.');
    if (room.banned.includes(uid)) throw new Error('You were removed from this room.');
    if (room.players[uid]) return;
    await availableMembership(uid, transaction);
    if (room.status !== 'waiting') throw new Error('This match has already started.');
    if (room.locked) throw new Error('This room is locked. Ask the host to unlock it.');
    if (Object.keys(room.players).length >= room.options.capacity) throw new Error('This room is full.');
    const profile = await currentProfile(uid, transaction);
    transaction.update(ref, { players: { ...room.players, [uid]: profile }, joinOrder: [...room.joinOrder, uid] });
    transaction.set(membershipRef(uid), { code });
  });
}

export async function changeRoom(code: string, uid: string, action: 'settings' | 'lock' | 'start' | 'leave' | 'remove' | 'transfer' | 'close', value?: RoomOptions | string): Promise<void> {
  await runTransaction(getFirestore(auth.app), async transaction => {
    const ref = roomRef(code);
    const snapshot = await transaction.get(ref);
    const room = snapshot.exists() ? parseRoom(snapshot.data()) : null;
    if (!room || room.status === 'closed') throw new Error('This room is no longer available.');
    if (!room.players[uid]) throw new Error('You’re no longer in this room.');
    if (action === 'leave') {
      if (uid === room.host && Object.keys(room.players).length === 1) transaction.update(ref, { status: 'closed' });
      else {
        const players = { ...room.players }; delete players[uid];
        const joinOrder = remainingJoinOrder(room.joinOrder, uid);
        const successor = uid === room.host ? nextHost(room.joinOrder, uid) : null;
        if (uid === room.host && !successor) throw new Error('No player is available to host.');
        transaction.update(ref, { players, joinOrder, ...(successor ? { host: successor } : {}) });
      }
      return;
    }
    if (uid !== room.host) throw new Error('Only the host can do that.');
    if (action === 'close') { transaction.update(ref, { status: 'closed' }); return; }
    if (action === 'transfer') {
      const target = value as string;
      if (target === uid || !room.players[target]) throw new Error('Choose a player who is still in this room.');
      transaction.update(ref, { host: target });
      return;
    }
    if (room.status !== 'waiting') throw new Error('This match has already started.');
    if (action === 'settings') {
      const options = value as RoomOptions;
      if (options.capacity < Object.keys(room.players).length) throw new Error('Capacity can’t be lower than the current player count.');
      transaction.update(ref, { options });
    } else if (action === 'lock') transaction.update(ref, { locked: !room.locked });
    else if (action === 'start') {
      if (Object.keys(room.players).length < 2) throw new Error('At least 2 players are needed to start.');
      transaction.update(ref, { status: 'started' });
    } else if (action === 'remove') {
      const target = value as string;
      if (target === uid || !room.players[target]) throw new Error('Player is no longer here.');
      const players = { ...room.players }; delete players[target]; transaction.update(ref, { players, joinOrder: remainingJoinOrder(room.joinOrder, target), banned: [...room.banned, target] });
    }
  });
}

export function watchReactions(code: string, onReaction: (sender: string, symbol: ReactionSymbol) => void, onError: (message: string) => void): Unsubscribe {
  const seen = new Map<string, number>();
  return onSnapshot(reactionsRef(code), { includeMetadataChanges: true }, snapshot => {
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      if (change.doc.metadata.hasPendingWrites || !reactionSymbols.includes(data.symbol as ReactionSymbol) || typeof data.sentAt?.toMillis !== 'function') continue;
      const sentAt: number = data.sentAt.toMillis();
      if (Date.now() - sentAt > 10_000 || seen.get(change.doc.id) === sentAt) continue;
      seen.set(change.doc.id, sentAt);
      onReaction(change.doc.id, data.symbol as ReactionSymbol);
    }
  }, error => onError(roomError(error)));
}

export async function sendReaction(code: string, uid: string, symbol: ReactionSymbol): Promise<void> {
  await setDoc(doc(reactionsRef(code), uid), { symbol, sentAt: serverTimestamp() });
}

export function watchMessages(code: string, onMessages: (messages: LiveMessage[]) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(query(messagesRef(code), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
    onMessages(snapshot.docs.map(message => ({ id: message.id, sender: message.data().sender as string, text: message.data().text as string })).reverse());
  }, error => onError(roomError(error)));
}

export async function sendMessage(code: string, uid: string, text: string): Promise<void> {
  const body = text.trim();
  if (!body || body.length > 160) throw new Error('Write a message under 160 characters.');
  await addDoc(messagesRef(code), { sender: uid, text: body, createdAt: serverTimestamp() });
}

export function watchRoom(code: string, onRoom: (room: Room | null) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(roomRef(code), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache && !snapshot.exists()) return;
    onRoom(snapshot.exists() ? parseRoom(snapshot.data()) : null);
  }, error => onError(roomError(error)));
}
