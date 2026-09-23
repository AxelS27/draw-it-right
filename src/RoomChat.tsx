import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import './room-chat.css';

export type ChatMessage = { id: number; author: string; text: string; sample?: boolean };

export function RoomChat({ messages, onSend, onClose }: { messages: ChatMessage[]; onSend: (text: string) => void; onClose?: () => void }) {
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim().slice(0, 160));
    setDraft('');
  }
  return <section className="waiting-chat-panel" aria-label="Room chat">
    <div className="waiting-chat-heading"><div><h2><MessageCircle size={18}/>Room chat</h2><p>Local preview. Only you see your messages.</p></div>{onClose && <button className="waiting-icon-button" type="button" aria-label="Close chat" onClick={onClose}><X size={19}/></button>}</div>
    <div className="waiting-chat-log" ref={log} role="log" aria-label="Preview messages" aria-live="polite" aria-relevant="additions">
      {messages.map(message => <article key={message.id} className={`waiting-message${message.sample ? ' is-sample' : ''}`}><div><strong>{message.author}</strong><span>{message.sample ? 'Sample' : 'Only you'}</span></div><p>{message.text}</p></article>)}
    </div>
    <form className="waiting-chat-form" onSubmit={submit}><label className="sr-only" htmlFor={onClose ? 'mobile-chat-message' : 'chat-message'}>Message</label><input id={onClose ? 'mobile-chat-message' : 'chat-message'} value={draft} maxLength={160} placeholder="Say hello…" autoComplete="off" onChange={event => setDraft(event.target.value)}/><button type="submit" aria-label="Send message" disabled={!draft.trim()}><Send size={18}/></button></form>
  </section>;
}
