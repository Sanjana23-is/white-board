import logger from '../utils/logger.js';

/**
 * Register all socket event handlers for a connected socket.
 * Handlers are thin — business logic lives in RoomManager.
 */
export function registerSocketHandlers(io, socket, roomManager) {

  // ─── Room Events ────────────────────────────────────────

  socket.on('room:join', ({ roomId, username }) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error:validation', { message: 'Invalid room ID' });
      return;
    }

    // Leave any existing room first
    const currentRoom = roomManager.findRoomBySocket(socket.id);
    if (currentRoom) {
      leaveRoom(io, socket, roomManager, currentRoom);
    }

    const user = roomManager.joinRoom(roomId, socket.id, { username });
    socket.join(roomId);

    // Confirm to sender — include canvas history for replay
    socket.emit('room:joined', {
      roomId,
      user,
      users: roomManager.getRoomUsers(roomId),
      canvasHistory: roomManager.getCanvas(roomId),
    });

    // Notify others in the room
    socket.to(roomId).emit('room:user-joined', { user });

    logger.info(`room:join  ${user.username} → ${roomId}`);
  });

  socket.on('room:leave', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (roomId) leaveRoom(io, socket, roomManager, roomId);
  });

  // ─── Room Messages ──────────────────────────────────────

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

  // ─── Cursor Events ─────────────────────────────────────

  socket.on('cursor:move', ({ x, y }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    socket.to(roomId).volatile.emit('cursor:update', {
      userId: socket.id, x, y,
    });
  });

  // ─── Drawing Events ─────────────────────────────────────

  socket.on('draw:start', ({ x, y, color, width }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;

    // Track in-progress stroke
    roomManager.beginStroke(socket.id, { x, y, color, width });

    // Broadcast to everyone else in the room
    socket.to(roomId).emit('draw:start', {
      userId: socket.id,
      x, y, color, width,
    });
  });

  socket.on('draw:move', ({ x, y }) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;

    // Append point to active stroke
    roomManager.continueStroke(socket.id, { x, y });

    // Volatile — drop if congested for low latency
    socket.to(roomId).volatile.emit('draw:move', {
      userId: socket.id, x, y,
    });
  });

  socket.on('draw:end', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;

    // Finalize and save to history
    roomManager.endStroke(socket.id, roomId);

    socket.to(roomId).emit('draw:end', { userId: socket.id });
  });

  // ─── Canvas Clear ─────────────────────────────────────

  socket.on('canvas:clear', () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;

    roomManager.clearCanvas(roomId);

    // Broadcast clear to the entire room (including sender)
    io.to(roomId).emit('canvas:clear');

    logger.info(`canvas:clear in room ${roomId} by ${socket.id}`);
  });

  // ─── Disconnect ─────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    logger.info(`Disconnected: ${socket.id} (${reason})`);
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (roomId) leaveRoom(io, socket, roomManager, roomId);
  });
}

/** Handle leaving a room — extracted for reuse. */
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
