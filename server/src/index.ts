import express from 'express';
import cors from 'cors';
import { cacheMeta } from './cache.js';
import { getCurrentGw, fetchBootstrap } from './fplClient.js';
import playersRouter from './routes/players.js';
import teamRouter from './routes/team.js';
import recommendRouter from './routes/recommend.js';
import optimizeRouter from './routes/optimize.js';

const app = express();
const PORT = process.env['PORT'] ?? 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    const gw = await getCurrentGw();
    const meta = cacheMeta();
    res.json({
      status: 'ok',
      currentGw: gw,
      cache: meta,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// Routes
app.use('/api/players', playersRouter);
app.use('/api/team', teamRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/optimize', optimizeRouter);

app.listen(PORT, () => {
  console.log(`FPL server running on http://localhost:${PORT}`);
});

export default app;
