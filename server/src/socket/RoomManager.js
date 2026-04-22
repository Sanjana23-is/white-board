import logger from '../utils/logger.js';

/**
 * In-memory room and user state manager.
 * Designed to be swappable with a Redis-backed implementation later.
 */
class RoomManager {
  constructor() {
    /** @type {Map<string, Map<string, object>>} roomId → Map<socketId, userData> */
    this.rooms = new Map();

    /**
     * Canvas history per room: roomId → stroke[]
     * Each stroke: { type: 'start'|'move'|'end', x, y, color, width, userId }
     * We store only completed strokes (start + points + end) as segments.
     * Format: { color, width, points: [{x,y}] }
     */
    this.canvasHistory = new Map();

    /** Temporary in-progress strokes: socketId → { color, width, points[] } */
    this.activeStrokes = new Map();
  }

  /** Add user to a room (auto-creates room if needed). */
  joinRoom(roomId, socketId, { username } = {}) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
      this.canvasHistory.set(roomId, []);
      logger.info(`Room created: ${roomId}`);
    }

    const room = this.rooms.get(roomId);
    const user = {
      userId: socketId,
      username: username || `User-${socketId.slice(0, 4)}`,
      color: this._assignColor(room.size),
      joinedAt: Date.now(),
    };

    room.set(socketId, user);
    logger.info(`${user.username} joined room ${roomId} (${room.size} users)`);
    return user;
  }

  /** Remove user from a room. Deletes room if empty. */
  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const user = room.get(socketId);
    room.delete(socketId);

    // Clean up any active stroke
    this.activeStrokes.delete(socketId);

    if (room.size === 0) {
      this.rooms.delete(roomId);
      this.canvasHistory.delete(roomId);
      logger.info(`Room ${roomId} deleted (empty)`);
    }
    return user || null;
  }

  /** Find which room a socket belongs to. */
  findRoomBySocket(socketId) {
    for (const [roomId, users] of this.rooms) {
      if (users.has(socketId)) return roomId;
    }
    return null;
  }

  /** Get all users in a room as an array. */
  getRoomUsers(roomId) {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.values()) : [];
  }

  // ─── Canvas History ─────────────────────────────────────

  /** Begin tracking a new stroke for a socket. */
  beginStroke(socketId, { x, y, color, width }) {
    this.activeStrokes.set(socketId, { color, width, points: [{ x, y }] });
  }

  /** Append a point to the active stroke. */
  continueStroke(socketId, { x, y }) {
    const stroke = this.activeStrokes.get(socketId);
    if (stroke) stroke.points.push({ x, y });
  }

  /** Finalize the stroke and save to room history. */
  endStroke(socketId, roomId) {
    const stroke = this.activeStrokes.get(socketId);
    this.activeStrokes.delete(socketId);
    if (!stroke || !roomId) return;

    const history = this.canvasHistory.get(roomId);
    if (history) {
      history.push(stroke);
      // Cap history at 500 strokes to avoid unbounded memory
      if (history.length > 500) history.shift();
    }
  }

  /** Return the full canvas history for a room (for late-joiner replay). */
  getCanvas(roomId) {
    return this.canvasHistory.get(roomId) || [];
  }

  /** Clear canvas for a room. */
  clearCanvas(roomId) {
    this.canvasHistory.set(roomId, []);
    // Clear any in-flight strokes for this room
    const room = this.rooms.get(roomId);
    if (room) {
      for (const socketId of room.keys()) {
        this.activeStrokes.delete(socketId);
      }
    }
  }

  /** Aggregate stats for health endpoint. */
  getStats() {
    let users = 0;
    for (const room of this.rooms.values()) users += room.size;
    return { rooms: this.rooms.size, users };
  }

  /** Assign a visually distinct color based on join order. */
  _assignColor(index) {
    const palette = [
      '#a855f7', '#06b6d4', '#f97316', '#10b981',
      '#f43f5e', '#3b82f6', '#eab308', '#ec4899',
    ];
    return palette[index % palette.length];
  }
}

export default RoomManager;
