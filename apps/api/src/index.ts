import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from '@repo/database';
import authRouter from './routes/auth';
import { authMiddleware } from './middleware/auth';
import tradesRouter from './routes/trades';
import dashboardRouter from './routes/dashboard';
import analyticsRouter from './routes/analytics';
import tagsRouter from './routes/tags';
import journalRouter from './routes/journal';
import settingsRouter from './routes/settings';
import accountsRouter from './routes/accounts';

dotenv.config();

if (!process.env.AUTH_SECRET) {
  console.error('FATAL: AUTH_SECRET is not set.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 4000;

app.set('trust proxy', 1);

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((s) => s.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.get('/', (req, res) => {
  res.send('Trading Journal API is running');
});

// Health check and DB check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Database connection failed', error);
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Public routes
app.use('/auth', authRouter);

// Protected routes
app.use('/trades', authMiddleware, tradesRouter);
app.use('/dashboard', authMiddleware, dashboardRouter);
app.use('/analytics', authMiddleware, analyticsRouter);
app.use('/tags', authMiddleware, tagsRouter);
app.use('/journal', authMiddleware, journalRouter);
app.use('/settings', authMiddleware, settingsRouter);
app.use('/accounts', authMiddleware, accountsRouter);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
