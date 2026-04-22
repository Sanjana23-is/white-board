import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * In-memory room and user state manager.
 * Designed to be swappable with a Redis-backed implementation later.
 */
class RoomManager {
  constructor() {
    /** @type {Map<string, Map<string, object>>} roomId → Map<socketId, userData> */
    this.rooms = new Map();
  }

  /** Add user to a room (auto-creates room if needed). */
  joinRoom(roomId, socketId, { username } = {}) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
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

    if (room.size === 0) {
      this.rooms.delete(roomId);
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
