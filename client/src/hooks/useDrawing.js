import { useCallback, useEffect, useRef } from 'react';

// ─── Emission thresholds ───────────────────────────────────
const MIN_DISTANCE_SQ = 9;   // Only emit if cursor moved ≥ 3px  (3² = 9)
const MIN_EMIT_MS     = 14;  // Cap at ~70fps regardless of screen refresh rate

/**
 * Bidirectional drawing over Socket.io — optimized edition.
 *
 * Outbound:
 *   - draw:start / draw:end  → reliable emit (stroke boundary events)
 *   - draw:move              → volatile emit, gated by distance + time throttle
 *   - canvas:clear           → reliable emit
 *
 * Inbound:
 *   - Remote draw events are queued and flushed via requestAnimationFrame
 *     so they never block the input thread.
 *
 * Replay:
 *   - canvasHistory strokes from room:joined are rendered synchronously
 *     (one-shot, no need for RAF).
 */
export function useDrawing(socket, canvasRef, ctxRef, toolState, isJoined) {

  // Per-remote-user stroke state: socketId → { x, y, color, width }
  const remoteStroke = useRef({});

  // RAF queue for remote draw events
  const remoteQueue = useRef([]);
  const remoteRafId = useRef(null);

  // Outbound throttle state
  const lastEmitPos  = useRef(null);
  const lastEmitTime = useRef(0);

  // ─── Remote rendering helpers ──────────────────────────

  function _applyStart(ctx, { userId, x, y, color, width, isEraser }) {
    remoteStroke.current[userId] = { x, y, color: color || '#a855f7', width: width || 3, isEraser: !!isEraser };
    ctx.save();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.beginPath();
    ctx.arc(x, y, (width || 3) / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : (color || '#a855f7');
    ctx.fill();
    ctx.restore();
  }

  function _applyMove(ctx, { userId, x, y }) {
    const state = remoteStroke.current[userId];
    if (!state) return;
    ctx.save();
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.globalCompositeOperation = state.isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = state.isEraser ? 'rgba(0,0,0,1)' : state.color;
    ctx.lineWidth   = state.width;
    ctx.beginPath();
    ctx.moveTo(state.x, state.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    remoteStroke.current[userId] = { ...state, x, y };
  }

  function _applyEnd(userId) {
    delete remoteStroke.current[userId];
  }

  // ─── RAF flush — processes the remote event queue ──────
  function flushRemoteQueue() {
    remoteRafId.current = null;
    const ctx = ctxRef.current;
    if (!ctx) return;

    // Drain the queue (grab all pending events atomically)
    const events = remoteQueue.current.splice(0);
    for (const ev of events) {
      switch (ev.type) {
        case 'start': _applyStart(ctx, ev.data); break;
        case 'move':  _applyMove(ctx, ev.data);  break;
        case 'end':   _applyEnd(ev.data.userId);  break;
        case 'clear': {
          const canvas = canvasRef.current;
          if (canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
          remoteStroke.current = {};
          break;
        }
        case 'shape': {
          const { type, points, color, width } = ev.data;
          const [p0, p1] = points || [];
          if (!p0 || !p1) break;
          ctx.save();
          ctx.strokeStyle = color || '#a855f7';
          ctx.lineWidth   = width  || 3;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          if (type === 'rect') {
            ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          } else {
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
      }
    }
  }

  function scheduleFlush() {
    if (!remoteRafId.current) {
      remoteRafId.current = requestAnimationFrame(flushRemoteQueue);
    }
  }

  // ─── Outbound emit helpers ─────────────────────────────

  const emitDrawStart = useCallback((x, y) => {
    lastEmitPos.current  = { x, y };
    lastEmitTime.current = Date.now();
    socket.emit('draw:start', {
      x, y,
      color:    toolState.current.color,
      width:    toolState.current.width,
      isEraser: toolState.current.mode === 'erase',
    });
  }, [socket, toolState]);

  const emitDrawMove = useCallback((x, y) => {
    // ① Distance gate — skip if cursor hasn't moved 3px
    const last = lastEmitPos.current;
    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy < MIN_DISTANCE_SQ) return;
    }

    // ② Time gate — cap at ~70fps
    const now = Date.now();
    if (now - lastEmitTime.current < MIN_EMIT_MS) return;

    lastEmitPos.current  = { x, y };
    lastEmitTime.current = now;

    // Volatile: okay to drop mid-stroke packets if the network is congested
    socket.volatile.emit('draw:move', { x, y });
  }, [socket]);

  const emitDrawEnd = useCallback(() => {
    lastEmitPos.current = null;
    socket.emit('draw:end');
  }, [socket]);

  const emitClear = useCallback(() => {
    socket.emit('canvas:clear');
  }, [socket]);

  const emitUndo = useCallback(() => {
    socket.emit('canvas:undo');
  }, [socket]);

  const emitRedo = useCallback(() => {
    socket.emit('canvas:redo');
  }, [socket]);

  /** Emit a committed shape (rect or line) to the server. */
  const emitShape = useCallback((type, x1, y1, x2, y2) => {
    socket.emit('draw:shape', {
      type, x1, y1, x2, y2,
      color: toolState.current.color,
      width: toolState.current.width,
    });
  }, [socket, toolState]);

  const replayHistory = useCallback((history) => {
    const ctx = ctxRef.current;
    if (!ctx || !history?.length) return;

    for (const stroke of history) {
      const { color, width, points, isEraser, type } = stroke;

      ctx.save();
      ctx.lineCap    = 'round';
      ctx.lineJoin   = 'round';
      ctx.strokeStyle = color || '#a855f7';
      ctx.lineWidth   = width  || 3;
      ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

      if (type === 'rect' || type === 'line') {
        const [p0, p1] = points || [];
        if (!p0 || !p1) { ctx.restore(); continue; }
        ctx.beginPath();
        if (type === 'rect') ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        else { ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
      } else {
        if (!points?.length) { ctx.restore(); continue; }
        if (points.length === 1) {
          ctx.beginPath();
          ctx.arc(points[0].x, points[0].y, (width || 3) / 2, 0, Math.PI * 2);
          ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : (color || '#a855f7');
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }, [ctxRef]);

  // ─── Inbound socket listeners ──────────────────────────
  useEffect(() => {
    if (!isJoined) return;

    // Push to queue and schedule a RAF flush
    const onStart = (data) => { remoteQueue.current.push({ type: 'start', data }); scheduleFlush(); };
    const onMove  = (data) => { remoteQueue.current.push({ type: 'move',  data }); scheduleFlush(); };
    const onEnd   = (data) => { remoteQueue.current.push({ type: 'end',   data }); scheduleFlush(); };
    const onClear = ()     => { remoteQueue.current.push({ type: 'clear'       }); scheduleFlush(); };

    // Remote shape: render immediately — no RAF needed for a single operation
    const onShape = ({ type, points, color, width }) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const [p0, p1] = points || [];
      if (!p0 || !p1) return;
      ctx.save();
      ctx.strokeStyle = color || '#a855f7';
      ctx.lineWidth   = width  || 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (type === 'rect') {
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      } else {
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Undo/redo: server sends authoritative full history → clear + replay
    const onHistoryUpdate = ({ history }) => {
      // ① Cancel any queued remote RAF — stale draw:move segments from the
      //    just-undone stroke must NOT be flushed on top of the fresh redraw.
      if (remoteRafId.current) {
        cancelAnimationFrame(remoteRafId.current);
        remoteRafId.current = null;
      }
      remoteQueue.current  = [];  // drain buffered remote events
      remoteStroke.current = {};  // reset all in-progress remote stroke states

      // ② Clear and replay from server-authoritative history
      const ctx    = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      replayHistory(history);
    };

    socket.on('draw:start',            onStart);
    socket.on('draw:move',             onMove);
    socket.on('draw:end',              onEnd);
    socket.on('canvas:clear',          onClear);
    socket.on('draw:shape',            onShape);
    socket.on('canvas:history-update', onHistoryUpdate);

    return () => {
      socket.off('draw:start',            onStart);
      socket.off('draw:move',             onMove);
      socket.off('draw:end',              onEnd);
      socket.off('canvas:clear',          onClear);
      socket.off('draw:shape',            onShape);
      socket.off('canvas:history-update', onHistoryUpdate);

      // Cancel any pending RAF on cleanup
      if (remoteRafId.current) {
        cancelAnimationFrame(remoteRafId.current);
        remoteRafId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isJoined, ctxRef, canvasRef]);

  return { emitDrawStart, emitDrawMove, emitDrawEnd, emitClear, emitUndo, emitRedo, emitShape, replayHistory };
}
