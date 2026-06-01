import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import authRouter from './routes/auth';
import tradesRouter from './routes/trades';
import tagsRouter from './routes/tags';
import accountsRouter from './routes/accounts';
import settingsRouter from './routes/settings';
import analyticsRouter from './routes/analytics';
import dashboardRouter from './routes/dashboard';
import journalRouter from './routes/journal';
import uploadsRouter from './routes/uploads';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes — all mounted under /api/* to match Next.js structure
app.use('/api/auth-legacy', authRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/journal', journalRouter);
app.use('/api/uploads', uploadsRouter);

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
