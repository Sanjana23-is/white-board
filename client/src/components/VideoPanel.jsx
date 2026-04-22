import { useEffect, useRef } from 'react';
import './VideoPanel.css';

function VideoTile({ stream, username, muted = false, isLocal = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-tile${isLocal ? ' video-tile--local' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="video-el"
      />
      {!stream && (
        <div className="video-placeholder">
          <span className="video-avatar">{username?.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <span className="video-label">{isLocal ? 'You' : username}</span>
    </div>
  );
}

/**
 * Floating video panel — shows local + remote streams.
 *
 * Props:
 *   localStream  {MediaStream|null}
 *   peers        {{ [socketId]: { stream, username } }}
 *   isVideoOn    {boolean}
 *   videoError   {string|null}
 *   onStart      {fn}
 *   onStop       {fn}
 */
export default function VideoPanel({ localStream, peers, isVideoOn, videoError, onStart, onStop }) {
  const peerList = Object.entries(peers);
  const totalVideos = (localStream ? 1 : 0) + peerList.length;

  return (
    <div className={`video-panel${totalVideos > 0 ? ' video-panel--active' : ''}`}>
      {/* Header */}
      <div className="video-panel-header">
        <span className="video-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Video
        </span>

        <button
          id={isVideoOn ? 'stop-video-btn' : 'start-video-btn'}
          className={`btn btn-small ${isVideoOn ? 'btn-danger' : 'btn-primary'}`}
          onClick={isVideoOn ? onStop : onStart}
        >
          {isVideoOn ? 'Stop' : 'Start Video'}
        </button>
      </div>

      {/* Error */}
      {videoError && (
        <p className="video-error">⚠ {videoError}</p>
      )}

      {/* Video grid */}
      {(localStream || peerList.length > 0) && (
        <div className={`video-grid video-grid--${Math.min(totalVideos, 4)}`}>
          {localStream && (
            <VideoTile stream={localStream} username="You" muted isLocal />
          )}
          {peerList.map(([id, { stream, username }]) => (
            <VideoTile key={id} stream={stream} username={username} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!localStream && peerList.length === 0 && !videoError && (
        <p className="video-empty">Click Start Video to join the call</p>
      )}
    </div>
  );
}
