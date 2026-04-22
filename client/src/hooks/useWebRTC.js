import { useCallback, useEffect, useRef, useState } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * WebRTC mesh video calling hook.
 *
 * Flow:
 *   1. User clicks Start → getUserMedia() → emit webrtc:join-video
 *   2. Server returns existing video peers → we send offers to each
 *   3. Server notifies existing peers → they send us an offer
 *   4. Both sides answer + exchange ICE candidates
 */
export function useWebRTC(socket, isJoined, users) {
  const [localStream,    setLocalStream]    = useState(null);
  const [peers,          setPeers]          = useState({});  // socketId → {stream, username}
  const [isVideoOn,      setIsVideoOn]      = useState(false);
  const [videoError,     setVideoError]     = useState(null);

  const pcs            = useRef({});   // socketId → RTCPeerConnection
  const localStreamRef = useRef(null);

  // Build quick username lookup from users list
  const usernameOf = useCallback(
    (id) => users.find((u) => u.userId === id)?.username || id.slice(0, 6),
    [users]
  );

  // ─── Peer connection factory ──────────────────────────

  const createPC = useCallback((peerId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('webrtc:ice-candidate', { to: peerId, candidate });
    };

    pc.ontrack = ({ streams }) => {
      setPeers((prev) => ({
        ...prev,
        [peerId]: { ...prev[peerId], stream: streams[0] },
      }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(peerId);
      }
    };

    // Add local tracks immediately if stream exists
    localStreamRef.current
      ?.getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current));

    pcs.current[peerId] = pc;
    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const closePeer = useCallback((peerId) => {
    pcs.current[peerId]?.close();
    delete pcs.current[peerId];
    setPeers((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // ─── Initiate offer to a peer ─────────────────────────

  const callPeer = useCallback(async (peerId) => {
    if (pcs.current[peerId]) return; // already connected
    const pc = createPC(peerId);
    setPeers((prev) => ({
      ...prev,
      [peerId]: { stream: null, username: usernameOf(peerId) },
    }));
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { to: peerId, offer });
    } catch (err) {
      console.error('createOffer failed', err);
    }
  }, [socket, createPC, usernameOf]);

  // ─── Start / stop local video ─────────────────────────

  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setVideoError(null);

      // Add tracks to existing peer connections
      Object.values(pcs.current).forEach((pc) =>
        stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      );

      // Tell the server we're ready for video
      socket.emit('webrtc:join-video');
    } catch (err) {
      setVideoError(err.message);
    }
  }, [socket]);

  const stopVideo = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsVideoOn(false);
    socket.emit('webrtc:leave-video');

    // Close all peer connections
    Object.keys(pcs.current).forEach(closePeer);
    setPeers({});
  }, [socket, closePeer]);

  // ─── Socket listeners ─────────────────────────────────

  useEffect(() => {
    if (!isJoined) return;

    // Server told us who's already in video → call each of them
    async function onVideoPeers({ peers: peerIds }) {
      for (const id of peerIds) await callPeer(id);
    }

    // Someone else started video → they'll send us an offer; just init entry
    function onPeerJoinedVideo({ peerId }) {
      // If we have video on, send them an offer (they may not have initiated)
      if (localStreamRef.current) callPeer(peerId);
    }

    function onPeerLeftVideo({ peerId }) {
      closePeer(peerId);
    }

    async function onOffer({ from, offer }) {
      const pc = createPC(from);
      setPeers((prev) => ({
        ...prev,
        [from]: { stream: null, username: usernameOf(from) },
      }));
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { to: from, answer });
    }

    async function onAnswer({ from, answer }) {
      try {
        await pcs.current[from]?.setRemoteDescription(answer);
      } catch (e) { /* ignore if PC was closed */ }
    }

    async function onIceCandidate({ from, candidate }) {
      try {
        await pcs.current[from]?.addIceCandidate(candidate);
      } catch (e) { /* ignore stale candidates */ }
    }

    function onUserLeft({ userId }) {
      closePeer(userId);
    }

    socket.on('webrtc:video-peers',        onVideoPeers);
    socket.on('webrtc:peer-joined-video',  onPeerJoinedVideo);
    socket.on('webrtc:peer-left-video',    onPeerLeftVideo);
    socket.on('webrtc:offer',              onOffer);
    socket.on('webrtc:answer',             onAnswer);
    socket.on('webrtc:ice-candidate',      onIceCandidate);
    socket.on('room:user-left',            onUserLeft);

    return () => {
      socket.off('webrtc:video-peers',        onVideoPeers);
      socket.off('webrtc:peer-joined-video',  onPeerJoinedVideo);
      socket.off('webrtc:peer-left-video',    onPeerLeftVideo);
      socket.off('webrtc:offer',              onOffer);
      socket.off('webrtc:answer',             onAnswer);
      socket.off('webrtc:ice-candidate',      onIceCandidate);
      socket.off('room:user-left',            onUserLeft);
    };
  }, [socket, isJoined, callPeer, closePeer, createPC, usernameOf]);

  // ─── Cleanup on unmount ───────────────────────────────

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(pcs.current).forEach((pc) => pc.close());
    };
  }, []);

  return { localStream, peers, isVideoOn, videoError, startVideo, stopVideo };
}
