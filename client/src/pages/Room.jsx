import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';
import Whiteboard from '../components/Whiteboard';
import './Room.css';

export default function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket, connectSocket, disconnectSocket, isConnected } = useSocket();

  const username = searchParams.get('username') || 'Anonymous';
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [copied, setCopied] = useState(false);

  // Connect socket and join room
  useEffect(() => {
    connectSocket();

    function onConnect() {
      socket.emit('room:join', { roomId, username });
    }

    function onRoomJoined(data) {
      setCurrentUser(data.user);
      setUsers(data.users);
    }

    function onUserJoined({ user }) {
      setUsers((prev) => [...prev, user]);
    }

    function onUserLeft({ users: updatedUsers }) {
      setUsers(updatedUsers);
    }

    socket.on('connect', onConnect);
    socket.on('room:joined', onRoomJoined);
    socket.on('room:user-joined', onUserJoined);
    socket.on('room:user-left', onUserLeft);

    // If already connected, join immediately
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('room:joined', onRoomJoined);
      socket.off('room:user-joined', onUserJoined);
      socket.off('room:user-left', onUserLeft);
      socket.emit('room:leave');
      disconnectSocket();
    };
  }, [roomId, username, socket, connectSocket, disconnectSocket]);

  function handleCopyRoomId() {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <span className="copy-icon">{copied ? '✓' : '⎘'}</span>
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
                <span className="user-avatar" style={{ background: user.color }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="user-name">
                  {user.username}
                  {currentUser?.userId === user.userId && (
                    <span className="you-badge">you</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-footer">
          <button id="leave-room-btn" className="btn btn-secondary btn-small btn-full" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </aside>

      {/* Canvas Area */}
      <main className="room-canvas-area">
        <Whiteboard />
      </main>
    </div>
  );
}
