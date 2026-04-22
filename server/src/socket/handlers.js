import logger from '../utils/logger.js';

export function registerSocketHandlers(io, socket, roomManager) {

  // ─── Room ────────────────────────────────────────────

  socket.on('room:join', ({ roomId, username }) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error:validation', { message: 'Invalid room ID' });
      return;
    }
    const currentRoom = roomManager.findRoomBySocket(socket.id);
    if (currentRoom) leaveRoom(io, socket, roomManager, currentRoom);

    const user = roomManager.joinRoom(roomId, socket.id, { username });
    socket.join(roomId);

    socket.emit('room:joined', {
      roomId,
      user,
      users:         roomManager.getRoomUsers(roomId),
      canvasHistory: roomManager.getCanvas(roomId),
      notes:         roomManager.getNotes(roomId),
    });

    socket.to(roomId).emit('room:user-joined', { user });
    logger.info(`room:join  ${user.username} → ${roomId}`);
  });

  socket.on('room:leave', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (roomId) leaveRoom(io, socket, roomManager, roomId);
  });

  socket.on('room:message', ({ message }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId || !message) return;
    const user = roomManager.getRoomUsers(roomId).find(u => u.userId === socket.id);
    io.to(roomId).emit('room:message', {
      userId: socket.id,
      username: user?.username || 'Unknown',
      message,
      timestamp: Date.now(),
    });
  });

  // ─── Cursor ───────────────────────────────────────────

  socket.on('cursor:move', ({ x, y }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    socket.to(roomId).volatile.emit('cursor:update', { userId: socket.id, x, y });
  });

  // ─── Drawing ──────────────────────────────────────────

  socket.on('draw:start', ({ x, y, color, width }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.beginStroke(socket.id, { x, y, color, width });
    socket.to(roomId).emit('draw:start', { userId: socket.id, x, y, color, width });
  });

  socket.on('draw:move', ({ x, y }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.continueStroke(socket.id, { x, y });
    socket.to(roomId).volatile.emit('draw:move', { userId: socket.id, x, y });
  });

  socket.on('draw:end', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.endStroke(socket.id, roomId);
    socket.to(roomId).emit('draw:end', { userId: socket.id });
  });

  socket.on('canvas:clear', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.clearCanvas(roomId);
    io.to(roomId).emit('canvas:clear');
    logger.info(`canvas:clear in room ${roomId}`);
  });

  socket.on('canvas:undo', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    const history = roomManager.undoStroke(socket.id, roomId);
    if (history !== null) {
      io.to(roomId).emit('canvas:history-update', { history });
      logger.info(`canvas:undo by ${socket.id} in ${roomId}`);
    }
  });

  socket.on('canvas:redo', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    const history = roomManager.redoStroke(socket.id, roomId);
    if (history !== null) {
      io.to(roomId).emit('canvas:history-update', { history });
      logger.info(`canvas:redo by ${socket.id} in ${roomId}`);
    }
  });

  socket.on('draw:shape', ({ type, x1, y1, x2, y2, color, width }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId || !type) return;
    // Store as a 2-point stroke with a type field so replay + undo work
    const shape = {
      type,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      color: color || '#a855f7',
      width: width  || 3,
      userId: socket.id,
    };
    roomManager.addToHistory(roomId, shape);
    // Relay to every OTHER user in the room
    socket.to(roomId).emit('draw:shape', { ...shape, userId: socket.id });
  });

  // ─── WebRTC signaling relay ───────────────────────────

  socket.on('webrtc:join-video', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    const existingPeers = roomManager.joinVideo(roomId, socket.id);
    // Tell caller who is already in video
    socket.emit('webrtc:video-peers', { peers: existingPeers });
    // Notify others that this peer started video
    socket.to(roomId).emit('webrtc:peer-joined-video', { peerId: socket.id });
    logger.info(`webrtc:join-video ${socket.id} in ${roomId}`);
  });

  socket.on('webrtc:leave-video', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.leaveVideo(roomId, socket.id);
    socket.to(roomId).emit('webrtc:peer-left-video', { peerId: socket.id });
  });

  // Pure relay — server never inspects SDP/ICE
  socket.on('webrtc:offer', ({ to, offer }) => {
    socket.to(to).emit('webrtc:offer', { from: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc:answer', { from: socket.id, answer });
  });

  socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('webrtc:ice-candidate', { from: socket.id, candidate });
  });

  // ─── Sticky notes ─────────────────────────────────────

  socket.on('note:create', ({ note }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId || !note) return;
    const saved = roomManager.addNote(roomId, { ...note, userId: socket.id });
    io.to(roomId).emit('note:created', { note: saved });
  });

  socket.on('note:move', ({ id, x, y }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.updateNote(roomId, id, { x, y });
    // Volatile — tolerate drops for smooth drag sync
    socket.to(roomId).volatile.emit('note:moved', { id, x, y });
  });

  socket.on('note:update', ({ id, text }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.updateNote(roomId, id, { text });
    io.to(roomId).emit('note:updated', { id, text });
  });

  socket.on('note:delete', ({ id }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    roomManager.deleteNote(roomId, id);
    io.to(roomId).emit('note:deleted', { id });
  });

  // ─── Disconnect ───────────────────────────────────────

  socket.on('disconnect', (reason) => {
    logger.info(`Disconnected: ${socket.id} (${reason})`);
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (roomId) leaveRoom(io, socket, roomManager, roomId);
  });
}

function leaveRoom(io, socket, roomManager, roomId) {
  const user = roomManager.leaveRoom(roomId, socket.id);
  socket.leave(roomId);
  if (user) {
    io.to(roomId).emit('room:user-left', {
      userId: socket.id,
      username: user.username,
      users: roomManager.getRoomUsers(roomId),
    });
    logger.info(`room:leave  ${user.username} ← ${roomId}`);
  }
}
