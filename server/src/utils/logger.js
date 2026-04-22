const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.debug;

const COLORS = { debug: '36', info: '32', warn: '33', error: '31' };

const ts = () => new Date().toISOString();
const color = (code, text) => `\x1b[${code}m${text}\x1b[0m`;

function log(level, ...args) {
  if (LEVELS[level] >= CURRENT) {
    const prefix = color(COLORS[level], `[${ts()}] [${level.toUpperCase()}]`);
    console[level === 'error' ? 'error' : 'log'](prefix, ...args);
  }
}

const logger = {
  debug: (...a) => log('debug', ...a),
  info:  (...a) => log('info', ...a),
  warn:  (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
};

export default logger;
