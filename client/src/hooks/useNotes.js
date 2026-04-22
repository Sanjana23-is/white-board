import { useCallback, useEffect, useState } from 'react';

const NOTE_COLORS = ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#e9d5ff'];

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Manages sticky notes state and real-time sync via Socket.io.
 *
 * @param {object}  socket   - Socket.io client
 * @param {boolean} isJoined - Only attach listeners when in a room
 * @param {Array}   initial  - Notes received from room:joined (late-joiner replay)
 */
export function useNotes(socket, isJoined, initial = []) {
  const [notes, setNotes] = useState(() =>
    Object.fromEntries(initial.map((n) => [n.id, n]))
  );

  // Apply initial notes when they arrive (after socket connects)
  useEffect(() => {
    if (initial.length > 0) {
      setNotes(Object.fromEntries(initial.map((n) => [n.id, n])));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Outbound ─────────────────────────────────────────

  const createNote = useCallback((x, y) => {
    const note = {
      id:    makeId(),
      text:  '',
      x,
      y,
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    };
    // Optimistic update
    setNotes((prev) => ({ ...prev, [note.id]: note }));
    socket.emit('note:create', { note });
  }, [socket]);

  const moveNote = useCallback((id, x, y) => {
    setNotes((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], x, y } } : prev
    );
    socket.volatile.emit('note:move', { id, x, y });
  }, [socket]);

  const updateNote = useCallback((id, text) => {
    setNotes((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], text } } : prev
    );
    socket.emit('note:update', { id, text });
  }, [socket]);

  const deleteNote = useCallback((id) => {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    socket.emit('note:delete', { id });
  }, [socket]);

  // ─── Inbound ──────────────────────────────────────────

  useEffect(() => {
    if (!isJoined) return;

    function onCreated({ note }) {
      setNotes((prev) => ({ ...prev, [note.id]: note }));
    }
    function onMoved({ id, x, y }) {
      setNotes((prev) =>
        prev[id] ? { ...prev, [id]: { ...prev[id], x, y } } : prev
      );
    }
    function onUpdated({ id, text }) {
      setNotes((prev) =>
        prev[id] ? { ...prev, [id]: { ...prev[id], text } } : prev
      );
    }
    function onDeleted({ id }) {
      setNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    socket.on('note:created', onCreated);
    socket.on('note:moved',   onMoved);
    socket.on('note:updated', onUpdated);
    socket.on('note:deleted', onDeleted);

    return () => {
      socket.off('note:created', onCreated);
      socket.off('note:moved',   onMoved);
      socket.off('note:updated', onUpdated);
      socket.off('note:deleted', onDeleted);
    };
  }, [socket, isJoined]);

  return { notes, createNote, moveNote, updateNote, deleteNote };
}
