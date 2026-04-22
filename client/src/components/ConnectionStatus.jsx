import { useSocket } from '../hooks/useSocket';
import './ConnectionStatus.css';

const STATE_CONFIG = {
  idle:         { label: 'Idle',         className: 'status--idle' },
  connecting:   { label: 'Connecting…',  className: 'status--connecting' },
  connected:    { label: 'Connected',    className: 'status--connected' },
  disconnected: { label: 'Disconnected', className: 'status--disconnected' },
  error:        { label: 'Error',        className: 'status--error' },
};

export default function ConnectionStatus() {
  const { connectionState } = useSocket();
  const config = STATE_CONFIG[connectionState] || STATE_CONFIG.idle;

  return (
    <div className={`connection-status ${config.className}`} id="connection-status">
      <span className="status-dot" />
      <span className="status-label">{config.label}</span>
    </div>
  );
}
