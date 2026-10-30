// Cloud server: one deployment serving many firms, each signed in from any number of devices.
// The desktop app still runs the SQLite server in ../index.ts.
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { sql } from 'drizzle-orm';
import { REPO_ROOT, CLIENT_DIST } from './paths';

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

import { connectDatabase, closeDatabase, getDb } from './db';
import authRouter, { requireAuth } from './auth';
import clientsRouter from './routes/clients';
import invoicesRouter from './routes/invoices';
import dashboardRouter from './routes/dashboard';
import settingsRouter from './routes/settings';
import importRouter from './routes/import';
import syncRouter from './routes/sync';
import exportAllRouter from './routes/exportAll';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

/** Origins allowed to make state-changing requests. Same-origin requests from the deployed app
 *  always pass; APP_ORIGIN lists any others (comma separated), e.g. a Capacitor app later. */
const allowedOrigins = new Set([
  ...(process.env.APP_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  ...(isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
]);

const app = express();
// Behind the host's TLS proxy: needed for secure cookies and per-client rate limits
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // PDF previews are blob: URLs shown in an iframe
      'frame-src': ["'self'", 'blob:'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'upgrade-insecure-requests': isProduction ? [] : null,
    },
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// Cookies are SameSite=Lax, which already stops cross-site POSTs carrying them; this also
// rejects any cross-origin write that does get through.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (sameOrigin || allowedOrigins.has(origin)) return next();
  res.status(403).json({ error: 'Cross-origin request blocked' });
});

// API responses are per-user and must never be cached
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/healthz', async (_req, res) => {
  try {
    await getDb().execute(sql`SELECT 1`);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/invoices', requireAuth, invoicesRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/import', requireAuth, importRouter);
app.use('/api/sync', requireAuth, syncRouter);
app.use('/api/export-all', requireAuth, exportAllRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// The web app (single-page; unknown paths fall back to index.html)
app.use(express.static(CLIENT_DIST, {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      // Content-hashed by Vite: safe to cache forever
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // index.html, the service worker and the manifest must be revalidated to pick up releases
      res.set('Cache-Control', 'no-cache');
    }
  },
}));
app.get('*', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) res.status(err.status || 500).json({ error: err.status === 413 ? 'File is too large' : 'Internal server error' });
});

async function main() {
  await connectDatabase();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`LexLedger cloud server listening on port ${PORT}`);
  });
  const shutdown = () => {
    server.close(() => closeDatabase().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

export default app;
