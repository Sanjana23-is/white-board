import './RemoteCursors.css';

/**
 * Renders an overlay of all remote users' cursors inside the canvas container.
 * Each cursor is positioned absolutely using canvas coordinates.
 *
 * @param {{ [userId]: { x, y, color, username, visible } }} cursors
 */
export default function RemoteCursors({ cursors }) {
  const entries = Object.entries(cursors).filter(([, c]) => c.visible !== false);

  if (entries.length === 0) return null;

  return (
    <div className="remote-cursors" aria-hidden="true">
      {entries.map(([userId, { x, y, color, username }]) => (
        <div
          key={userId}
          className="remote-cursor"
          style={{
            transform: `translate(${x}px, ${y}px)`,
            '--cursor-color': color,
          }}
        >
          {/* SVG cursor arrow */}
          <svg
            className="cursor-svg"
            width="20"
            height="24"
            viewBox="0 0 20 24"
            fill="none"
          >
            <path
              d="M4 1L4 18L8 14L11.5 21L13.5 20L10 13L16 13L4 1Z"
              fill={color}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>

          {/* Name label */}
          <span
            className="cursor-label"
            style={{ background: color }}
          >
            {username}
          </span>
        </div>
      ))}
    </div>
  );
}
