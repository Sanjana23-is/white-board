import { useState, useEffect, useCallback } from 'react';

/**
 * Manages room join/leave lifecycle and tracks the user list.
 *
 * @param {object} socket  - Socket.io client instance
 * @param {string} roomId  - Room to join
 * @param {string} username
 * @returns {{ currentUser, users, isJoined }}
 */
export function useRoom(socket, roomId, username) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [isJoined, setIsJoined] = useState(false);

  const joinRoom = useCallback(() => {
    socket.emit('room:join', { roomId, username });
  }, [socket, roomId, username]);

  useEffect(() => {
    function onRoomJoined({ user, users: roomUsers }) {
      setCurrentUser(user);
      setUsers(roomUsers);
      setIsJoined(true);
    }

    function onUserJoined({ user }) {
      setUsers((prev) => {
        // Avoid duplicates (e.g. reconnect)
        if (prev.some((u) => u.userId === user.userId)) return prev;
        return [...prev, user];
      });
    }

    function onUserLeft({ users: updatedUsers }) {
      setUsers(updatedUsers);
    }

    socket.on('room:joined', onRoomJoined);
    socket.on('room:user-joined', onUserJoined);
    socket.on('room:user-left', onUserLeft);

    return () => {
      socket.off('room:joined', onRoomJoined);
      socket.off('room:user-joined', onUserJoined);
      socket.off('room:user-left', onUserLeft);
    };
  }, [socket]);

  return { currentUser, users, isJoined, joinRoom };
}
