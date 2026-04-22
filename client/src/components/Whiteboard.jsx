import { useRef, useState, useEffect, useCallback } from 'react';
import './Whiteboard.css';

/**
 * HTML Canvas whiteboard with smooth freehand drawing.
 * Tracks previous/current mouse positions for continuous line segments.
 */
export default function Whiteboard() {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // ─── Canvas Setup ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas.parentElement;

    // Size canvas to fill container
    function resize() {
      const rect = parent.getBoundingClientRect();
      // Save current drawing
      const imageData = ctxRef.current?.getImageData(0, 0, canvas.width, canvas.height);

      canvas.width = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#a855f7';
      ctxRef.current = ctx;

      // Restore drawing after resize
      if (imageData) {
        ctx.putImageData(imageData, 0, 0);
      }
    }

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ─── Get mouse/touch position relative to canvas ──────
  const getPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Support both mouse and touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  // ─── Drawing Handlers ─────────────────────────────────
  const startDrawing = useCallback((e) => {
    e.preventDefault();
    const pos = getPosition(e);
    lastPos.current = pos;
    setIsDrawing(true);

    // Draw a dot for single clicks
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }, [getPosition]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const ctx = ctxRef.current;
    const currentPos = getPosition(e);

    // Draw smooth line from previous to current position
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();

    // Update last position
    lastPos.current = currentPos;
  }, [isDrawing, getPosition]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // ─── Clear Canvas ─────────────────────────────────────
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

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
        <button
          id="clear-canvas-btn"
          className="btn btn-secondary btn-small"
          onClick={clearCanvas}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14H7L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          id="whiteboard-canvas"
          className="whiteboard-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
}
