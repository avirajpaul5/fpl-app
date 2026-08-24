import express from 'express';
import cors from 'cors';
import { cacheMeta } from './cache.js';
import { getCurrentGw } from './fplClient.js';
import playersRouter from './routes/players.js';
import teamRouter from './routes/team.js';
import recommendRouter from './routes/recommend.js';
import optimizeRouter from './routes/optimize.js';

const app = express();

app.use(cors());
app.use(express.json());

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

app.use('/api/players', playersRouter);
app.use('/api/team', teamRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/optimize', optimizeRouter);

export default app;
