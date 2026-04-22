import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

class RoomManager {
  constructor() {
    this.rooms           = new Map(); // roomId → Map<socketId, userData>
    this.canvasHistory   = new Map(); // roomId → stroke[]
    this.activeStrokes   = new Map(); // socketId → stroke in progress
    this.videoParticipants = new Map(); // roomId → Set<socketId>
    this.notes           = new Map(); // roomId → Map<noteId, note>
  }

  // ─── Room membership ───────────────────────────────────

  joinRoom(roomId, socketId, { username } = {}) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
      this.canvasHistory.set(roomId, []);
      this.notes.set(roomId, new Map());
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

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const user = room.get(socketId);
    room.delete(socketId);
    this.activeStrokes.delete(socketId);
    this.leaveVideo(roomId, socketId);

    if (room.size === 0) {
      this.rooms.delete(roomId);
      this.canvasHistory.delete(roomId);
      this.notes.delete(roomId);
      this.videoParticipants.delete(roomId);
      logger.info(`Room ${roomId} deleted (empty)`);
    }
    return user || null;
  }

  findRoomBySocket(socketId) {
    for (const [roomId, users] of this.rooms) {
      if (users.has(socketId)) return roomId;
    }
    return null;
  }

  getRoomUsers(roomId) {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.values()) : [];
  }

  // ─── Canvas history ────────────────────────────────────

  beginStroke(socketId, { x, y, color, width }) {
    this.activeStrokes.set(socketId, { color, width, points: [{ x, y }] });
  }

  continueStroke(socketId, { x, y }) {
    const stroke = this.activeStrokes.get(socketId);
    if (stroke) stroke.points.push({ x, y });
  }

  endStroke(socketId, roomId) {
    const stroke = this.activeStrokes.get(socketId);
    this.activeStrokes.delete(socketId);
    if (!stroke || !roomId) return;
    const history = this.canvasHistory.get(roomId);
    if (history) {
      history.push(stroke);
      if (history.length > 500) history.shift();
    }
  }

  getCanvas(roomId) {
    return this.canvasHistory.get(roomId) || [];
  }

  clearCanvas(roomId) {
    this.canvasHistory.set(roomId, []);
    const room = this.rooms.get(roomId);
    if (room) for (const sid of room.keys()) this.activeStrokes.delete(sid);
  }

  // ─── Video participants ────────────────────────────────

  /** Returns list of existing video participants (excluding the joiner). */
  joinVideo(roomId, socketId) {
    if (!this.videoParticipants.has(roomId)) {
      this.videoParticipants.set(roomId, new Set());
    }
    const set = this.videoParticipants.get(roomId);
    const existing = Array.from(set).filter(id => id !== socketId);
    set.add(socketId);
    return existing;
  }

  leaveVideo(roomId, socketId) {
    this.videoParticipants.get(roomId)?.delete(socketId);
  }

  // ─── Sticky notes ──────────────────────────────────────

  addNote(roomId, note) {
    const id = note.id || uuidv4().slice(0, 8);
    const full = { ...note, id, createdAt: Date.now() };
    this.notes.get(roomId)?.set(id, full);
    return full;
  }

  updateNote(roomId, id, updates) {
    const note = this.notes.get(roomId)?.get(id);
    if (note) Object.assign(note, updates);
  }

  deleteNote(roomId, id) {
    this.notes.get(roomId)?.delete(id);
  }

  getNotes(roomId) {
    const m = this.notes.get(roomId);
    return m ? Array.from(m.values()) : [];
  }

  // ─── Stats ────────────────────────────────────────────

  getStats() {
    let users = 0;
    for (const room of this.rooms.values()) users += room.size;
    return { rooms: this.rooms.size, users };
  }

  _assignColor(index) {
    const palette = [
      '#a855f7', '#06b6d4', '#f97316', '#10b981',
      '#f43f5e', '#3b82f6', '#eab308', '#ec4899',
    ];
    return palette[index % palette.length];
  }
}

export default RoomManager;
