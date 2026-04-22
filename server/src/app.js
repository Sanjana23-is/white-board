import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import { createHealthRouter } from './routes/health.js';

/**
 * Create and configure the Express application.
 * Socket.io is attached separately to the HTTP server.
 */
export function createApp(roomManager) {
  const app = express();

  // ─── Middleware ──────────────────────────────────────────
  app.use(cors({
    origin: config.clientUrl,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  // ─── Routes ─────────────────────────────────────────────
  app.use('/api', createHealthRouter(roomManager));

  // ─── 404 Handler ────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // ─── Error Handler ──────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
