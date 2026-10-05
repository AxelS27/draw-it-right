import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import './room-chat.css';

export type ChatMessage = { id: number | string; author: string; text: string; sample?: boolean; isYou?: boolean };

export function RoomChat({ messages, onSend, onClose, live = false }: { messages: ChatMessage[]; onSend: (text: string) => void | Promise<void>; onClose?: () => void; live?: boolean }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError('');
    try { await onSend(draft.trim().slice(0, 160)); setDraft(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Couldn’t send. Try again.'); }
    finally { setSending(false); }
  }
  return <section className="waiting-chat-panel" aria-label="Room chat">
    <div className="waiting-chat-heading"><div><h2><MessageCircle size={18}/>Room chat</h2><p>{live ? 'Only players in this room can see messages.' : 'Local preview. Only you see your messages.'}</p></div>{onClose && <button className="waiting-icon-button" type="button" data-sound="close" aria-label="Close chat" onClick={onClose}><X size={19}/></button>}</div>
    <div className="waiting-chat-log" ref={log} role="log" aria-label={live ? 'Room messages' : 'Preview messages'} aria-live="polite" aria-relevant="additions">
      {live && messages.length === 0 && <p className="waiting-chat-empty">No messages yet. Say hi to the room!</p>}
      {messages.map(message => <article key={message.id} className={`waiting-message${message.sample ? ' is-sample' : ''}`}><div><strong>{message.author}</strong><span>{message.sample ? 'Sample' : live ? message.isYou ? 'You' : 'Player' : 'Only you'}</span></div><p>{message.text}</p></article>)}
    </div>
    {error && <p className="waiting-chat-error" role="alert">{error}</p>}
    <form className="waiting-chat-form" onSubmit={event => void submit(event)}><label className="sr-only" htmlFor={onClose ? 'mobile-chat-message' : 'chat-message'}>Message</label><input id={onClose ? 'mobile-chat-message' : 'chat-message'} value={draft} maxLength={160} placeholder="Say hello…" autoComplete="off" onChange={event => setDraft(event.target.value)}/><button type="submit" aria-label="Send message" disabled={!draft.trim() || sending}><Send size={18}/></button></form>
  </section>;
}
