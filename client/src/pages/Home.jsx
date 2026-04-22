import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import ConnectionStatus from '../components/ConnectionStatus';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState('');
  const [username, setUsername] = useState('');

  function handleCreateRoom() {
    const roomId = uuidv4().slice(0, 8);
    const name = username.trim() || 'Anonymous';
    navigate(`/room/${roomId}?username=${encodeURIComponent(name)}`);
  }

  function handleJoinRoom(e) {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    const name = username.trim() || 'Anonymous';
    navigate(`/room/${joinRoomId.trim()}?username=${encodeURIComponent(name)}`);
  }

  return (
    <div className="home">
      {/* Animated background orbs */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="home-content animate-fadeInUp">
        {/* Header */}
        <header className="home-header">
          <ConnectionStatus />
        </header>

        {/* Hero */}
        <div className="hero glass-card">
          <div className="hero-badge">✨ Real-time Collaboration</div>
          <h1>
            <span className="gradient-text">SyncBoard</span>
          </h1>
          <p className="hero-tagline">
            Draw, brainstorm, and collaborate in real-time with your team.
          </p>

          {/* Username */}
          <div className="form-group">
            <input
              id="username-input"
              type="text"
              className="input"
              placeholder="Your display name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
            />
          </div>

          {/* Create room */}
          <button id="create-room-btn" className="btn btn-primary btn-full" onClick={handleCreateRoom}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create New Room
          </button>

          {/* Divider */}
          <div className="divider">
            <span>or join existing</span>
          </div>

          {/* Join room */}
          <form className="join-form" onSubmit={handleJoinRoom}>
            <input
              id="room-id-input"
              type="text"
              className="input"
              placeholder="Enter Room ID"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              maxLength={12}
            />
            <button id="join-room-btn" type="submit" className="btn btn-secondary">
              Join
            </button>
          </form>
        </div>

        {/* Footer tagline */}
        <p className="footer-text">
          Powered by WebSockets • Zero-latency drawing sync
        </p>
      </div>
    </div>
  );
}
