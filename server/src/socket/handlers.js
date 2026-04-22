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

    // Confirm to sender
    socket.emit('room:joined', {
      roomId,
      user,
      users: roomManager.getRoomUsers(roomId),
    });

    // Notify others
    socket.to(roomId).emit('room:user-joined', { user });
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
    // Broadcast to everyone in room including sender
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
    // Volatile — tolerate drops for low latency
    socket.to(roomId).volatile.emit('cursor:update', {
      userId: socket.id, x, y,
    });
  });

  // ─── Drawing Events (stubs for Phase 2) ─────────────────

  socket.on('draw:start', (data) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('draw:start', { ...data, userId: socket.id });
  });

  socket.on('draw:move', (data) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    socket.to(roomId).volatile.emit('draw:move', { ...data, userId: socket.id });
  });

  socket.on('draw:end', (data) => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('draw:end', { ...data, userId: socket.id });
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
  }
}
