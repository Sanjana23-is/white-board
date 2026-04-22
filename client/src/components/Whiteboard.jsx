import { useRef, useState, useEffect, useCallback, useContext, forwardRef, useImperativeHandle } from 'react';
import { SocketContext } from '../context/SocketContext';
import { useDrawing } from '../hooks/useDrawing';
import { useCursor } from '../hooks/useCursor';
import { useNotes } from '../hooks/useNotes';
import RemoteCursors from './RemoteCursors';
import StickyNotes from './StickyNotes';
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
const Whiteboard = forwardRef(function Whiteboard({ isJoined = false, users = [], initialNotes = [] }, ref) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // RAF queue for local rendering — prevents multiple strokes per frame
  const localQueue = useRef([]);
  const localRafId = useRef(null);

  // Tool state — kept in a ref so useDrawing can read current values without re-render
  const [color, setColor] = useState('#a855f7');
  const [width, setWidth] = useState(4);
  const [mode,  setMode]  = useState('pen'); // 'pen' | 'erase' | 'rect' | 'line'
  const toolState = useRef({ color, width, mode });
  useEffect(() => { toolState.current = { color, width, mode }; }, [color, width, mode]);

  // Shape mode: snapshot before drag, start position
  const shapeStart    = useRef(null);
  const shapeSnapshot = useRef(null);

  // Socket from context
  const { socket } = useContext(SocketContext);

  const { emitDrawStart, emitDrawMove, emitDrawEnd, emitClear, emitUndo, emitRedo, emitShape, replayHistory } =
    useDrawing(socket, canvasRef, ctxRef, toolState, isJoined);

  const { remoteCursors, emitCursorMove, emitCursorHide } =
    useCursor(socket, isJoined, users);

  const { notes, createNote, moveNote, updateNote, deleteNote } =
    useNotes(socket, isJoined, initialNotes);

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
    return () => {
      window.removeEventListener('resize', resize);
      if (localRafId.current) cancelAnimationFrame(localRafId.current);
    };
  }, []);

  // ─── Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z ─
  useEffect(() => {
    function onKeyDown(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl || !isJoined) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); emitUndo(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); emitRedo(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isJoined, emitUndo, emitRedo]);

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

  /** Flush all queued line segments in one RAF tick */
  const flushLocalQueue = useCallback(() => {
    localRafId.current = null;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const segments = localQueue.current.splice(0);
    for (const { from, to, color, width, isEraser } of segments) {
      ctx.save();
      ctx.lineCap    = 'round';
      ctx.lineJoin   = 'round';
      ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth   = width;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  const startDrawing = useCallback((e) => {
    e.preventDefault();
    const pos = getPosition(e);
    lastPos.current = pos;
    setIsDrawing(true);

    const { color, width, mode } = toolState.current;
    const ctx = ctxRef.current;

    if (mode === 'pen' || mode === 'erase') {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, width / 2, 0, Math.PI * 2);
      ctx.fillStyle = mode === 'erase' ? 'rgba(0,0,0,1)' : color;
      ctx.fill();
      ctx.restore();
      if (isJoined) emitDrawStart(pos.x, pos.y);
    } else {
      // Shape mode — save snapshot for preview
      const canvas = canvasRef.current;
      shapeStart.current    = pos;
      shapeSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }, [getPosition, isJoined, emitDrawStart, canvasRef]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const currentPos = getPosition(e);
    const { color, width, mode } = toolState.current;

    if (mode === 'pen' || mode === 'erase') {
      localQueue.current.push({
        from: { ...lastPos.current }, to: currentPos,
        color, width, isEraser: mode === 'erase',
      });
      if (!localRafId.current) localRafId.current = requestAnimationFrame(flushLocalQueue);
      if (isJoined) emitDrawMove(currentPos.x, currentPos.y);
    } else if (shapeSnapshot.current) {
      // Shape preview — restore snapshot then draw preview
      const ctx = ctxRef.current;
      ctx.putImageData(shapeSnapshot.current, 0, 0);
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const { x: x1, y: y1 } = shapeStart.current;
      const { x: x2, y: y2 } = currentPos;
      ctx.beginPath();
      if (mode === 'rect') ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      else { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      ctx.restore();
    }
    emitCursorMove(currentPos.x, currentPos.y);
    lastPos.current = currentPos;
  }, [isDrawing, getPosition, toolState, isJoined, emitDrawMove, emitCursorMove, flushLocalQueue]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const { mode, color, width } = toolState.current;

    if (mode === 'pen' || mode === 'erase') {
      if (isJoined) emitDrawEnd();
    } else if (shapeSnapshot.current && shapeStart.current) {
      // Commit shape — canvas already shows it from last preview
      const { x: x1, y: y1 } = shapeStart.current;
      const { x: x2, y: y2 } = lastPos.current;
      if (isJoined) emitShape(mode, x1, y1, x2, y2);
      shapeSnapshot.current = null;
      shapeStart.current    = null;
    }
  }, [isDrawing, isJoined, emitDrawEnd, emitShape]);

  /** Track cursor position even when not drawing */
  const handleMouseMove = useCallback((e) => {
    const pos = getPosition(e);
    emitCursorMove(pos.x, pos.y);
    draw(e); // forward to drawing handler
  }, [getPosition, emitCursorMove, draw]);

  /** Add a sticky note at the centre of the canvas */
  const handleAddNote = useCallback(() => {
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width  / 2 - 90 : 100;
    const cy = canvas ? canvas.height / 2 - 70 : 100;
    createNote(cx, cy);
  }, [canvasRef, createNote]);

  // ─── Export ────────────────────────────────────────────

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `syncboard-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }, [canvasRef]);

  const exportPDF = useCallback(async () => {
    const canvas = canvasRef.current;
    const imgData = canvas.toDataURL('image/png', 1.0);
    const w = canvas.width;
    const h = canvas.height;
    // Dynamic import keeps jsPDF out of the initial bundle
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({
      orientation: w >= h ? 'landscape' : 'portrait',
      unit: 'px',
      format: [w, h],
      hotfixes: ['px_scaling'],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    pdf.save(`syncboard-${Date.now()}.pdf`);
  }, [canvasRef]);

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

        {/* Mode selector */}
        <div className="toolbar-group" style={{ paddingLeft: 0, borderLeft: 'none' }}>
          {[
            { id: 'pen',   label: '✏️', title: 'Pen' },
            { id: 'erase', label: '⬜', title: 'Eraser' },
            { id: 'rect',  label: '▭',  title: 'Rectangle' },
            { id: 'line',  label: '╱',  title: 'Line' },
          ].map(({ id, label, title }) => (
            <button
              key={id}
              id={`mode-${id}-btn`}
              className={`btn btn-small btn-secondary${mode === id ? ' active-mode' : ''}`}
              onClick={() => setMode(id)}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>

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

        {/* Undo / Redo */}
        <div className="toolbar-group">
          <button
            id="undo-btn"
            className="btn btn-secondary btn-small"
            onClick={emitUndo}
            disabled={!isJoined}
            title="Undo (Ctrl+Z)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            Undo
          </button>
          <button
            id="redo-btn"
            className="btn btn-secondary btn-small"
            onClick={emitRedo}
            disabled={!isJoined}
            title="Redo (Ctrl+Y)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
            Redo
          </button>
        </div>

        {/* Add Note */}
        <button
          id="add-note-btn"
          className="btn btn-secondary btn-small"
          onClick={handleAddNote}
          title="Add sticky note"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Note
        </button>

        {/* Clear canvas */}
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

        {/* Export */}
        <div className="toolbar-group">
          <button
            id="export-png-btn"
            className="btn btn-secondary btn-small"
            onClick={exportPNG}
            title="Save as PNG"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            PNG
          </button>
          <button
            id="export-pdf-btn"
            className="btn btn-secondary btn-small"
            onClick={exportPDF}
            title="Save as PDF"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            PDF
          </button>
        </div>
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
        <RemoteCursors cursors={remoteCursors} />
        <StickyNotes
          notes={notes}
          onMove={moveNote}
          onUpdate={updateNote}
          onDelete={deleteNote}
        />
      </div>
    </div>
  );
});

export default Whiteboard;
