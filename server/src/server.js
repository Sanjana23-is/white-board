import http from 'http';
import express from 'express';
import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { initializeSocket } from './socket/index.js';

// 1. Create bare HTTP server
const server = http.createServer(express());

// 2. Initialize Socket.io (must happen before Express replaces the listener)
const { io, roomManager } = initializeSocket(server);

// 3. Create Express app with roomManager injected
const app = createApp(roomManager);
server.removeAllListeners('request');
server.on('request', app);

// 4. Start listening
server.listen(config.port, () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
  logger.info(`📡 Socket.io ready for connections`);
  logger.info(`🔗 Client expected at ${config.clientUrl}`);
});

// 5. Graceful shutdown
function shutdown(signal) {
  logger.info(`${signal} received — shutting down...`);
  io.close(() => {
    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
