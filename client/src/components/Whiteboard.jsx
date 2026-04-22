import { useRef, useState, useEffect, useCallback, useContext, forwardRef, useImperativeHandle } from 'react';
import { SocketContext } from '../context/SocketContext';
import { useDrawing } from '../hooks/useDrawing';
import { useCursor } from '../hooks/useCursor';
import RemoteCursors from './RemoteCursors';
import './Whiteboard.css';

const COLORS = [
  '#a855f7', '#06b6d4', '#f97316', '#10b981',
  '#f43f5e', '#3b82f6', '#eab308', '#ffffff',
  '#ec4899', '#64748b',
];

const WIDTHS = [2, 4, 8, 14];

/**
 * HTML Canvas whiteboard with smooth freehand drawing + real-time socket sync.
 *
 * Props (optional — works standalone if not provided):
 *   isJoined   {boolean}  Whether socket room has been joined
 *   onClearBroadcast {fn} Called when the user clicks Clear (lets parent emit canvas:clear)
 */
const Whiteboard = forwardRef(function Whiteboard({ isJoined = false, users = [] }, ref) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Tool state — kept in a ref so useDrawing can read current values without re-render
  const [color, setColor] = useState('#a855f7');
  const [width, setWidth] = useState(4);
  const toolState = useRef({ color, width });
  useEffect(() => { toolState.current = { color, width }; }, [color, width]);

  // Socket from context
  const { socket } = useContext(SocketContext);

  const { emitDrawStart, emitDrawMove, emitDrawEnd, emitClear, replayHistory } =
    useDrawing(socket, canvasRef, ctxRef, toolState, isJoined);

  // Cursor tracking
  const { remoteCursors, emitCursorMove, emitCursorHide } =
    useCursor(socket, isJoined, users);

  // ─── Canvas Setup ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas.parentElement;

    function resize() {
      const rect = parent.getBoundingClientRect();

      // Only save existing pixels if canvas already has content
      const imageData =
        ctxRef.current && canvas.width > 0 && canvas.height > 0
          ? ctxRef.current.getImageData(0, 0, canvas.width, canvas.height)
          : null;

      canvas.width  = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext('2d');
      ctx.lineCap    = 'round';
      ctx.lineJoin   = 'round';
      ctx.lineWidth  = toolState.current.width;
      ctx.strokeStyle = toolState.current.color;
      ctxRef.current = ctx;

      if (imageData) ctx.putImageData(imageData, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Expose replayHistory so Room.jsx can call it after room:joined
  useImperativeHandle(ref, () => ({ replayHistory }), [replayHistory]);

  // ─── Get pointer position relative to canvas ──────────
  const getPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ─── Drawing Handlers ─────────────────────────────────
  const startDrawing = useCallback((e) => {
    e.preventDefault();
    const pos = getPosition(e);
    lastPos.current = pos;
    setIsDrawing(true);

    const ctx = ctxRef.current;
    ctx.strokeStyle = toolState.current.color;
    ctx.lineWidth   = toolState.current.width;

    // Draw a dot for single clicks
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, toolState.current.width / 2, 0, Math.PI * 2);
    ctx.fillStyle = toolState.current.color;
    ctx.fill();

    if (isJoined) emitDrawStart(pos.x, pos.y);
  }, [getPosition, isJoined, emitDrawStart]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const ctx = ctxRef.current;
    const currentPos = getPosition(e);

    ctx.strokeStyle = toolState.current.color;
    ctx.lineWidth   = toolState.current.width;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();

    if (isJoined) emitDrawMove(currentPos.x, currentPos.y);
    // Also update cursor position while drawing
    emitCursorMove(currentPos.x, currentPos.y);
    lastPos.current = currentPos;
  }, [isDrawing, getPosition, isJoined, emitDrawMove, emitCursorMove]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (isJoined) emitDrawEnd();
  }, [isDrawing, isJoined, emitDrawEnd]);

  /** Track cursor position even when not drawing */
  const handleMouseMove = useCallback((e) => {
    const pos = getPosition(e);
    emitCursorMove(pos.x, pos.y);
    draw(e); // forward to drawing handler
  }, [getPosition, emitCursorMove, draw]);

  // ─── Clear ────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isJoined) emitClear();
  }, [isJoined, emitClear]);

  return (
    <div className="whiteboard-wrapper">
      {/* Toolbar */}
      <div className="whiteboard-toolbar">
        <span className="toolbar-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
          </svg>
          Canvas
        </span>

        {/* Color Picker */}
        <div className="toolbar-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-swatch${color === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>

        {/* Width Picker */}
        <div className="toolbar-widths">
          {WIDTHS.map((w) => (
            <button
              key={w}
              className={`width-swatch${width === w ? ' active' : ''}`}
              onClick={() => setWidth(w)}
              title={`${w}px`}
              aria-label={`Stroke width ${w}px`}
            >
              <span
                className="width-dot"
                style={{
                  width: `${Math.min(w * 2, 20)}px`,
                  height: `${Math.min(w * 2, 20)}px`,
                  background: color,
                }}
              />
            </button>
          ))}
        </div>

        <button
          id="clear-canvas-btn"
          className="btn btn-secondary btn-small"
          onClick={handleClear}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14H7L5 6" />
            <path d="M10 11v6" /><path d="M14 11v6" />
          </svg>
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          id="whiteboard-canvas"
          className={`whiteboard-canvas${isDrawing ? ' drawing' : ''}`}
          onMouseDown={startDrawing}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseLeave={() => { stopDrawing(); emitCursorHide(); }}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {/* Remote cursors overlay */}
        <RemoteCursors cursors={remoteCursors} />
      </div>
    </div>
  );
});

export default Whiteboard;
