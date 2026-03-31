import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './db';
import clientsRouter from './routes/clients';
import invoicesRouter from './routes/invoices';
import dashboardRouter from './routes/dashboard';
import settingsRouter from './routes/settings';
// Load .env: try userData path (Electron) first, then project root
if (process.env.ELECTRON === '1' && process.env.COPIES_PATH) {
  const userDataEnvPath = path.join(path.dirname(process.env.COPIES_PATH), '.env');
  dotenv.config({ path: userDataEnvPath });
}
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
const app = express();
const PORT = process.env.PORT || 3000;
const isElectron = process.env.ELECTRON === '1';
// Middleware
app.use(cors());
app.use(express.json());
// API Routes
app.use('/api/clients', clientsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/settings', settingsRouter);
// Serve React build in production (not needed in Electron — it loads files directly)
if (!isElectron) {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
// Initialize DB and start server
initDatabase();
app.listen(PORT, () => {
  console.log(`🚀 LexLedger server running on http://localhost:${PORT}`);
  // Signal to Electron parent process that the server is ready
  if (isElectron && process.send) {
    process.send('server-ready');
  }
});
export default app;