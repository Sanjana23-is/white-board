import { Server } from 'socket.io';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import RoomManager from './RoomManager.js';
import { registerSocketHandlers } from './handlers.js';

/**
 * Initialize Socket.io on the HTTP server.
 * Returns io instance and roomManager for use by Express routes.
 */
export function initializeSocket(httpServer) {
  const roomManager = new RoomManager();

  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e6,
    perMessageDeflate: false,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    logger.info(`Connected: ${socket.id}`);

    socket.emit('connection:established', {
      socketId: socket.id,
      serverTime: Date.now(),
    });

    registerSocketHandlers(io, socket, roomManager);
  });

  logger.info('Socket.io initialized');
  return { io, roomManager };
}
