import { useCallback, useEffect, useRef } from 'react';

/**
 * Bidirectional drawing over Socket.io.
 *
 * Outbound: local pointer events → emit draw:start/move/end + canvas:clear
 * Inbound:  remote draw:* / canvas:clear events → render on the shared canvas
 * Replay:   canvas history array from room:joined → render existing strokes
 */
export function useDrawing(socket, canvasRef, ctxRef, toolState, isJoined) {

  /**
   * Per-remote-user stroke state:
   *   socketId → { x, y, color, width }
   * Stored so draw:move can use the correct style set during draw:start.
   */
  const remoteStroke = useRef({});

  // ─── Outbound helpers ──────────────────────────────────

  const emitDrawStart = useCallback((x, y) => {
    socket.emit('draw:start', {
      x, y,
      color: toolState.current.color,
      width: toolState.current.width,
    });
  }, [socket, toolState]);

  const emitDrawMove = useCallback((x, y) => {
    socket.emit('draw:move', { x, y });
  }, [socket]);

  const emitDrawEnd = useCallback(() => {
    socket.emit('draw:end');
  }, [socket]);

  const emitClear = useCallback(() => {
    socket.emit('canvas:clear');
  }, [socket]);

  // ─── Canvas rendering helpers ──────────────────────────

  function applyRemoteStart(ctx, { userId, x, y, color, width }) {
    // Store style for this user's stroke
    remoteStroke.current[userId] = { x, y, color: color || '#a855f7', width: width || 3 };

    // Draw a dot for single-tap strokes
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, (width || 3) / 2, 0, Math.PI * 2);
    ctx.fillStyle = color || '#a855f7';
    ctx.fill();
    ctx.restore();
  }

  function applyRemoteMove(ctx, { userId, x, y }) {
    const state = remoteStroke.current[userId];
    if (!state) return;

    ctx.save();
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.strokeStyle = state.color;
    ctx.lineWidth   = state.width;
    ctx.beginPath();
    ctx.moveTo(state.x, state.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();

    // Update last position
    remoteStroke.current[userId] = { ...state, x, y };
  }

  function applyRemoteEnd(userId) {
    delete remoteStroke.current[userId];
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx    = ctxRef.current;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    remoteStroke.current = {};
  }

  // ─── Replay canvas history (late-joiner) ──────────────

  const replayHistory = useCallback((history) => {
    const ctx = ctxRef.current;
    if (!ctx || !history?.length) return;

    for (const stroke of history) {
      const { color, width, points } = stroke;
      if (!points?.length) continue;

      ctx.save();
      ctx.lineCap    = 'round';
      ctx.lineJoin   = 'round';
      ctx.strokeStyle = color || '#a855f7';
      ctx.lineWidth   = width || 3;

      if (points.length === 1) {
        // Single-point stroke → dot
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, (width || 3) / 2, 0, Math.PI * 2);
        ctx.fillStyle = color || '#a855f7';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [ctxRef]);

  // ─── Inbound Socket Listeners ──────────────────────────

  useEffect(() => {
    if (!isJoined) return;

    function onRemoteStart(data) {
      const ctx = ctxRef.current;
      if (ctx) applyRemoteStart(ctx, data);
    }
    function onRemoteMove(data) {
      const ctx = ctxRef.current;
      if (ctx) applyRemoteMove(ctx, data);
    }
    function onRemoteEnd({ userId }) {
      applyRemoteEnd(userId);
    }
    function onClear() {
      clearCanvas();
    }

    socket.on('draw:start', onRemoteStart);
    socket.on('draw:move',  onRemoteMove);
    socket.on('draw:end',   onRemoteEnd);
    socket.on('canvas:clear', onClear);

    return () => {
      socket.off('draw:start', onRemoteStart);
      socket.off('draw:move',  onRemoteMove);
      socket.off('draw:end',   onRemoteEnd);
      socket.off('canvas:clear', onClear);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isJoined, ctxRef]);

  return {
    emitDrawStart,
    emitDrawMove,
    emitDrawEnd,
    emitClear,
    replayHistory,
  };
}
