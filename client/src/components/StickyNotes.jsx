import { useCallback, useRef, useState } from 'react';
import './StickyNotes.css';

/**
 * Renders draggable sticky notes as DOM overlays on the canvas.
 *
 * Props:
 *   notes      {{ [id]: { id, text, x, y, color } }}
 *   onMove     {fn(id, x, y)}
 *   onUpdate   {fn(id, text)}
 *   onDelete   {fn(id)}
 */
export default function StickyNotes({ notes, onMove, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const dragState = useRef(null); // { id, startMouseX, startMouseY, startNoteX, startNoteY }

  const onMouseDown = useCallback((e, id, noteX, noteY) => {
    // Only drag on the note header, not the textarea
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    e.stopPropagation(); // Prevent canvas drawing

    dragState.current = {
      id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNoteX:  noteX,
      startNoteY:  noteY,
    };

    function onMouseMove(ev) {
      const { id, startMouseX, startMouseY, startNoteX, startNoteY } = dragState.current;
      const newX = startNoteX + (ev.clientX - startMouseX);
      const newY = startNoteY + (ev.clientY - startMouseY);
      onMove(id, newX, newY);
    }

    function onMouseUp() {
      dragState.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [onMove]);

  return (
    <div className="sticky-notes-layer" aria-label="Sticky notes">
      {Object.values(notes).map((note) => (
        <div
          key={note.id}
          className="sticky-note"
          style={{
            transform: `translate(${note.x}px, ${note.y}px)`,
            '--note-color': note.color,
          }}
          onMouseDown={(e) => onMouseDown(e, note.id, note.x, note.y)}
        >
          {/* Drag handle / header */}
          <div className="note-header">
            <span className="note-drag-handle">⠿</span>
            <button
              className="note-delete-btn"
              onClick={() => onDelete(note.id)}
              title="Delete note"
              aria-label="Delete note"
            >
              ✕
            </button>
          </div>

          {/* Text area */}
          <textarea
            className="note-textarea"
            value={note.text}
            placeholder="Type your note…"
            onFocus={() => setEditingId(note.id)}
            onBlur={() => setEditingId(null)}
            onChange={(e) => onUpdate(note.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
