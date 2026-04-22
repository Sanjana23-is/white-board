import { useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useRoom } from '../hooks/useRoom';
import { useToasts, ToastContainer } from '../components/Toast';
import ConnectionStatus from '../components/ConnectionStatus';
import Whiteboard from '../components/Whiteboard';
import './Room.css';

export default function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket, connectSocket, disconnectSocket, isConnected } = useSocket();

  const username = searchParams.get('username') || 'Anonymous';

  // ─── Room membership ─────────────────────────────────
  const { currentUser, users, isJoined, joinRoom } = useRoom(socket, roomId, username);

  // ─── Toast notifications ──────────────────────────────
  const { toasts, showToast } = useToasts();

  // Track previous users list to detect changes
  const prevUsersRef = useRef([]);
  const hasJoinedRef = useRef(false);

  // ─── Connect socket & join room on mount ──────────────
  useEffect(() => {
    connectSocket();

    function onConnect() {
      joinRoom();
    }

    socket.on('connect', onConnect);

    // If already connected, join immediately
    if (socket.connected) {
      joinRoom();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.emit('room:leave');
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ─── Toast on user join / leave ───────────────────────
  useEffect(() => {
    const prev = prevUsersRef.current;
    const prevIds = new Set(prev.map((u) => u.userId));
    const currIds = new Set(users.map((u) => u.userId));

    // Joined
    users.forEach((u) => {
      if (!prevIds.has(u.userId) && u.userId !== currentUser?.userId) {
        showToast({ message: `${u.username} joined the room`, type: 'join' });
      }
    });

    // Left
    prev.forEach((u) => {
      if (!currIds.has(u.userId) && u.userId !== currentUser?.userId) {
        showToast({ message: `${u.username} left the room`, type: 'leave' });
      }
    });

    prevUsersRef.current = users;
  }, [users, currentUser, showToast]);

  // Toast when we ourselves join
  useEffect(() => {
    if (isJoined && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      showToast({ message: `You joined room ${roomId}`, type: 'info' });
    }
  }, [isJoined, roomId, showToast]);

  // ─── Whiteboard ref for history replay ────────────────
  const whiteboardRef = useRef(null);

  useEffect(() => {
    function onRoomJoined({ canvasHistory }) {
      // Replay existing strokes once the canvas is ready
      if (canvasHistory?.length && whiteboardRef.current?.replayHistory) {
        // Small delay to ensure canvas resize has run first
        setTimeout(() => {
          whiteboardRef.current.replayHistory(canvasHistory);
        }, 100);
      }
    }

    socket.on('room:joined', onRoomJoined);
    return () => socket.off('room:joined', onRoomJoined);
  }, [socket]);

  // ─── Handlers ─────────────────────────────────────────
  function handleCopyRoomId() {
    navigator.clipboard.writeText(roomId);
    showToast({ message: 'Room ID copied!', type: 'info' });
  }

  function handleLeave() {
    navigate('/');
  }

  return (
    <div className="room">
      {/* Sidebar */}
      <aside className="room-sidebar glass-card">
        <div className="sidebar-header">
          <h2 className="gradient-text">SyncBoard</h2>
          <ConnectionStatus />
        </div>

        {/* Room info */}
        <div className="room-info">
          <span className="room-info-label">Room ID</span>
          <button
            id="copy-room-id-btn"
            className="room-id-chip"
            onClick={handleCopyRoomId}
            title="Copy Room ID"
          >
            <code>{roomId}</code>
            <span className="copy-icon">⎘</span>
          </button>
        </div>

        {/* Users */}
        <div className="users-section">
          <h3 className="section-title">
            Online
            <span className="user-count">{users.length}</span>
          </h3>
          <ul className="users-list">
            {users.map((user) => (
              <li key={user.userId} className="user-item">
                <span
                  className="user-avatar"
                  style={{ background: user.color }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="user-name">
                  {user.username}
                  {currentUser?.userId === user.userId && (
                    <span className="you-badge">you</span>
                  )}
                </span>
                {/* Online indicator */}
                <span className="user-online-dot" />
              </li>
            ))}

            {users.length === 0 && (
              <li className="users-empty">Connecting…</li>
            )}
          </ul>
        </div>

        <div className="sidebar-footer">
          <button
            id="leave-room-btn"
            className="btn btn-secondary btn-small btn-full"
            onClick={handleLeave}
          >
            Leave Room
          </button>
        </div>
      </aside>

      {/* Canvas Area */}
      <main className="room-canvas-area">
        <Whiteboard ref={whiteboardRef} isJoined={isJoined} users={users} />
      </main>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
