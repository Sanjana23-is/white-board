import { useState, useEffect, useCallback, useRef } from 'react';

const THROTTLE_MS = 40; // ~25fps — smooth without flooding the server

/**
 * Real-time cursor tracking hook.
 *
 * - Outbound: throttled `cursor:move` emit on pointer move
 * - Inbound:  `cursor:update` events → remoteCursors map
 * - Cleanup:  removes cursor when user leaves (`room:user-left`)
 *
 * @param {object}  socket    - Socket.io client
 * @param {boolean} isJoined  - Only emit/listen once in a room
 * @param {Array}   users     - Room user list (for color + username lookup)
 */
export function useCursor(socket, isJoined, users) {
  const [remoteCursors, setRemoteCursors] = useState({});

  // Fast lookup: userId → { color, username }
  const userInfoRef = useRef({});
  useEffect(() => {
    const map = {};
    users.forEach((u) => {
      map[u.userId] = { color: u.color, username: u.username };
    });
    userInfoRef.current = map;
  }, [users]);

  // ─── Inbound listeners ─────────────────────────────────
  useEffect(() => {
    if (!isJoined) return;

    function onCursorUpdate({ userId, x, y }) {
      const info = userInfoRef.current[userId] || {};
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: {
          x,
          y,
          color: info.color || '#a855f7',
          username: info.username || '?',
          visible: x >= 0 && y >= 0,
        },
      }));
    }

    function onUserLeft({ userId }) {
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }

    socket.on('cursor:update', onCursorUpdate);
    socket.on('room:user-left', onUserLeft);

    return () => {
      socket.off('cursor:update', onCursorUpdate);
      socket.off('room:user-left', onUserLeft);
    };
  }, [socket, isJoined]);

  // ─── Outbound — throttled emit ─────────────────────────
  const lastEmitRef = useRef(0);

  const emitCursorMove = useCallback(
    (x, y) => {
      if (!isJoined) return;
      const now = Date.now();
      if (now - lastEmitRef.current < THROTTLE_MS) return;
      lastEmitRef.current = now;
      socket.volatile.emit('cursor:move', { x, y });
    },
    [socket, isJoined]
  );

  /** Call this when mouse leaves the canvas to hide our cursor for others. */
  const emitCursorHide = useCallback(() => {
    if (!isJoined) return;
    socket.volatile.emit('cursor:move', { x: -1, y: -1 });
  }, [socket, isJoined]);

  return { remoteCursors, emitCursorMove, emitCursorHide };
}
