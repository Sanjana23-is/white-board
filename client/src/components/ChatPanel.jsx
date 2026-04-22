import { useState, useEffect, useRef } from 'react';
import './ChatPanel.css';

export default function ChatPanel({ messages, currentUser, onSend, onClose }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  }

  function fmt(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="chat-panel glass-card">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat
        </span>
        <button className="chat-close-btn" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hi! 👋</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === currentUser?.userId;
          return (
            <div key={msg.id} className={`chat-msg${isMe ? ' chat-msg--me' : ''}`}>
              {!isMe && <span className="chat-username">{msg.username}</span>}
              <div className="chat-bubble">{msg.message}</div>
              <span className="chat-time">{fmt(msg.timestamp)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form className="chat-form" onSubmit={handleSend}>
        <input
          id="chat-input"
          className="chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          autoComplete="off"
        />
        <button id="chat-send-btn" className="btn btn-primary btn-small" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
