// Projection accuracy, deadline by deadline, against FPL's own expected points.
//   npm run backtest:accuracy --workspace=engine [-- 2024-25 2025-26]
// FPL's live ep_next equals FPL "form" (average points over the last 30 days),
// so form is the baseline. Archived "xP" values in public datasets are written
// after each gameweek and leak its result — never use them as a baseline.
import { projectAll } from '../src/index.js';
import { loadSeasonWithPrior, type Season } from './season.js';

interface Pair { model: number; form: number; actual: number; model5: number; actual5: number | null }

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (x[i]! - mx) * (y[i]! - my); vx += (x[i]! - mx) ** 2; vy += (y[i]! - my) ** 2; }
  return c / Math.sqrt(vx * vy);
}

export function seasonPairs(season: Season): Pair[] {
  const pairs: Pair[] = [];
  const data = season.replayData();
  for (let gw = 2; gw <= season.maxGw; gw++) {
    const proj = projectAll({ players: season.modelPlayers(gw), fixtures: season.fixtures, nextGw: gw, horizon: 5, rules: season.rules });
    for (const p of season.players.values()) {
      // Players a manager would consider: an appearance in the previous four GWs.
      const recent = [1, 2, 3, 4].map((k) => gw - k).filter((g) => g >= 1);
      if (!recent.some((g) => data.actual(p.id, g).mins > 0)) continue;
      const pr = proj.get(p.id);
      if (!pr) continue;
      const form = recent.reduce((s, g) => s + data.actual(p.id, g).pts, 0) / recent.length;
      const actual5 = gw + 4 <= season.maxGw ? [0, 1, 2, 3, 4].reduce((s, k) => s + data.actual(p.id, gw + k).pts, 0) : null;
      pairs.push({ model: pr.byGw[0]!, form, actual: data.actual(p.id, gw).pts, model5: pr.byGw.reduce((a, b) => a + b, 0), actual5 });
    }
  }
  return pairs;
}

if (process.argv[1]?.endsWith('accuracy.ts')) {
  const seasons = process.argv.slice(2).length ? process.argv.slice(2) : ['2023-24', '2024-25', '2025-26'];
  console.log('season    n       next-GW r (model / FPL form)   RMSE (model / form)   5-GW r   bias');
  for (const name of seasons) {
    const pairs = seasonPairs(await loadSeasonWithPrior(name));
    const rmse = (k: 'model' | 'form') => Math.sqrt(pairs.reduce((s, p) => s + (p[k] - p.actual) ** 2, 0) / pairs.length);
    const five = pairs.filter((p) => p.actual5 != null);
    const bias = pairs.reduce((s, p) => s + p.model - p.actual, 0) / pairs.length;
    console.log(
      `${name}  ${String(pairs.length).padEnd(7)} ${pearson(pairs.map((p) => p.model), pairs.map((p) => p.actual)).toFixed(3)} / ${pearson(pairs.map((p) => p.form), pairs.map((p) => p.actual)).toFixed(3)}`.padEnd(54) +
      `${rmse('model').toFixed(2)} / ${rmse('form').toFixed(2)}`.padEnd(22) +
      `${pearson(five.map((p) => p.model5), five.map((p) => p.actual5!)).toFixed(3)}    ${bias >= 0 ? '+' : ''}${bias.toFixed(2)}`,
    );
  }
}
