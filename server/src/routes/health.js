import { Router } from 'express';

export function createHealthRouter(roomManager) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      ...roomManager.getStats(),
    });
  });

  return router;
}
