import { useState, useCallback, useEffect, useRef } from 'react';

export function useChat(socket, isJoined) {
  const [messages, setMessages] = useState([]);
  const [unread,   setUnread]   = useState(0);
  const [isOpen,   setIsOpen]   = useState(false);
  const isOpenRef = useRef(false);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      isOpenRef.current = !prev;
      if (!prev) setUnread(0); // clear badge when opening
      return !prev;
    });
  }, []);

  const sendMessage = useCallback((text) => {
    if (!text.trim() || !isJoined) return;
    socket.emit('room:message', { message: text.trim() });
  }, [socket, isJoined]);

  useEffect(() => {
    if (!isJoined) return;
    function onMessage(msg) {
      setMessages((prev) => [...prev, { ...msg, id: `${msg.timestamp}-${Math.random()}` }]);
      if (!isOpenRef.current) setUnread((u) => u + 1);
    }
    socket.on('room:message', onMessage);
    return () => socket.off('room:message', onMessage);
  }, [socket, isJoined]);

  return { messages, unread, isOpen, toggle, sendMessage };
}
