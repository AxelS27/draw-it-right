import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { gameAudio } from './audio';
import './room-chat.css';

export type ChatMessage = { id: number | string; author: string; text: string; sample?: boolean; isYou?: boolean; senderId?: string };

const otherChatColors = [
  { bg: '#e3effb', author: '#255c8a' },
  { bg: '#fbe5eb', author: '#993b56' },
  { bg: '#fdf0d5', author: '#8f5d14' },
  { bg: '#ece4fa', author: '#5b3c8c' },
  { bg: '#fde8df', author: '#9c4529' },
  { bg: '#ddf3f4', author: '#1d6970' },
  { bg: '#f5e4f3', author: '#7c3474' },
  { bg: '#e5eafc', author: '#394b94' },
];

function playerChatColor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return otherChatColors[hash % otherChatColors.length]!;
}

export function useUnreadChat(messages: ChatMessage[], dialogRef: RefObject<HTMLDialogElement | null>) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(messages.length);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setSeen(messages.length);
      return;
    }
    if (open) {
      setSeen(messages.length);
      return;
    }
    const last = messages.at(-1);
    if (last?.isYou) setSeen(messages.length);
  }, [messages, open]);

  const unread = open ? 0 : Math.max(0, messages.length - seen);
  const openChat = () => {
    setOpen(true);
    setSeen(messages.length);
    dialogRef.current?.showModal();
  };
  const closeChat = () => {
    setOpen(false);
    setSeen(messages.length);
    dialogRef.current?.close();
  };
  const onDialogClose = () => {
    setOpen(false);
    setSeen(messages.length);
  };
  return { unread, openChat, closeChat, onDialogClose };
}

export function RoomChat({ messages, onSend, onClose, live = false }: { messages: ChatMessage[]; onSend: (text: string) => void | Promise<void>; onClose?: () => void; live?: boolean }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const seenCount = useRef<number | null>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    if (seenCount.current === null) {
      seenCount.current = messages.length;
      return;
    }
    if (messages.length > seenCount.current) {
      const last = messages.at(-1);
      if (last && !last.isYou && !last.sample) gameAudio.play('select');
    }
    seenCount.current = messages.length;
  }, [messages]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending || cooldown > 0) return;
    setSending(true);
    setError('');
    try {
      await onSend(draft.trim().slice(0, 160));
      setDraft('');
      setCooldown(5);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Couldn’t send. Try again.'); }
    finally { setSending(false); }
  }
  return <section className="waiting-chat-panel" aria-label="Room chat">
    <div className="waiting-chat-heading"><div><h2><MessageCircle size={18}/>Room chat</h2><p>{live ? 'Only players in this room can see messages.' : 'Local preview. Only you see your messages.'}</p></div>{onClose && <button className="waiting-icon-button" type="button" data-sound="close" aria-label="Close chat" onClick={onClose}><X size={19}/></button>}</div>
    <div className="waiting-chat-log" ref={log} role="log" aria-label={live ? 'Room messages' : 'Preview messages'} aria-live="polite" aria-relevant="additions">
      {live && messages.length === 0 && <p className="waiting-chat-empty">No messages yet. Say hi to the room!</p>}
      {messages.map(message => {
        const isMine = live ? Boolean(message.isYou) : !message.sample;
        const isEvent = live && Boolean(message.sample);
        const palette = !isMine && !isEvent ? playerChatColor(message.senderId || message.author) : null;
        return <article key={message.id} className={`waiting-message ${isMine ? 'is-mine' : 'is-other'}${message.sample ? ' is-sample' : ''}${isEvent ? ' is-event' : ''}`} style={palette ? { backgroundColor: palette.bg } : undefined}><div><strong style={palette ? { color: palette.author } : undefined}>{message.author}</strong>{!live && <span>{message.sample ? 'Sample' : 'Only you'}</span>}</div><p>{message.text}</p></article>;
      })}
    </div>
    {error && <p className="waiting-chat-error" role="alert">{error}</p>}
    <form className="waiting-chat-form" onSubmit={event => void submit(event)}><label className="sr-only" htmlFor={onClose ? 'mobile-chat-message' : 'chat-message'}>Message</label><input id={onClose ? 'mobile-chat-message' : 'chat-message'} value={draft} maxLength={160} placeholder={cooldown > 0 ? `Wait ${cooldown}s to chat…` : 'Say hello…'} autoComplete="off" onChange={event => setDraft(event.target.value)}/><button type="submit" aria-label="Send message" disabled={!draft.trim() || sending || cooldown > 0}>{cooldown > 0 ? cooldown : <Send size={18}/>}</button></form>
  </section>;
}
