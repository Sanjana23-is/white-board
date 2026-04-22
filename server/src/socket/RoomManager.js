import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

class RoomManager {
  constructor() {
    this.rooms             = new Map();
    this.canvasHistory     = new Map();
    this.activeStrokes     = new Map();
    this.redoStacks        = new Map(); // socketId → stroke[]
    this.videoParticipants = new Map();
    this.notes             = new Map();
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
    this.redoStacks.delete(socketId);
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
      // Tag stroke with owner so undo can find it later
      history.push({ ...stroke, userId: socketId });
      if (history.length > 500) history.shift();
      // Any new stroke clears the user's redo stack
      this.redoStacks.set(socketId, []);
    }
  }

  getCanvas(roomId) {
    return this.canvasHistory.get(roomId) || [];
  }

  clearCanvas(roomId) {
    this.canvasHistory.set(roomId, []);
    const room = this.rooms.get(roomId);
    if (room) {
      for (const sid of room.keys()) {
        this.activeStrokes.delete(sid);
        this.redoStacks.delete(sid); // also clear redo stacks on hard clear
      }
    }
  }

  /** Remove the calling user's last stroke; returns updated history or null. */
  undoStroke(socketId, roomId) {
    const history = this.canvasHistory.get(roomId);
    if (!history) return null;

    // Find last stroke owned by this user
    let idx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].userId === socketId) { idx = i; break; }
    }
    if (idx === -1) return null; // nothing to undo

    const [stroke] = history.splice(idx, 1);

    // Push onto redo stack
    if (!this.redoStacks.has(socketId)) this.redoStacks.set(socketId, []);
    this.redoStacks.get(socketId).push(stroke);

    return history; // caller will broadcast this
  }

  /** Re-apply the user's last undone stroke; returns updated history or null. */
  redoStroke(socketId, roomId) {
    const redoStack = this.redoStacks.get(socketId);
    if (!redoStack?.length) return null;

    const stroke = redoStack.pop();
    const history = this.canvasHistory.get(roomId);
    if (!history) return null;

    history.push(stroke);
    return history;
  }

  /** Push a pre-built item (e.g. a shape) straight into room history. */
  addToHistory(roomId, item) {
    const history = this.canvasHistory.get(roomId);
    if (!history) return;
    history.push(item);
    if (history.length > 500) history.shift();
    // New item clears the committing user's redo stack
    if (item.userId) this.redoStacks.set(item.userId, []);
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
