// Season simulation: managers start from diverse GW1 squads and follow the
// engine's transfer, lineup and captain advice every week (no chips).
//   npm run backtest:simulate --workspace=engine [-- 2024-25] [--managers 10]
import {
  adviseWeek,
  attachProjections,
  followAdvisor,
  optimizeSquad,
  projectAll,
  type Player,
  type ProjectedPlayer,
} from '../src/index.js';
import { loadSeasonWithPrior, type Season } from './season.js';

const HORIZON = 8;

function projected(season: Season, gw: number): ProjectedPlayer[] {
  const proj = projectAll({ players: season.modelPlayers(gw), fixtures: season.fixtures, nextGw: gw, horizon: HORIZON, rules: season.rules });
  const players: Player[] = [];
  for (const p of season.players.values()) {
    const at = season.rowAt(p, gw);
    if (!at || !proj.has(p.id)) continue;
    players.push({
      id: p.id, name: p.name, pos: p.pos, team: at.team, teamName: '', price: at.price, epNext: 0, ppg: 0, form: 0,
      expectedGoals: 0, expectedAssists: 0, minutes: 0, ownership: 0, status: 'a', chanceNext: null, totalPoints: 0, upcoming: [],
    });
  }
  return attachProjections(players, proj, HORIZON);
}

/** Deterministic pseudo-random squads: optimise on noisy pre-season projections. */
function startingSquads(pool: ProjectedPlayer[], n: number): number[][] {
  const squads: number[][] = [];
  for (let i = 0; i < n; i++) {
    let seed = 1000 + i * 7919;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const noisy = pool.map((p) => {
      const z = Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
      return { ...p, projByGw: p.projByGw.map((v) => v * Math.exp(0.35 * z)) };
    });
    squads.push(optimizeSquad(noisy, { horizon: 5 }).players.map((p) => p.id));
  }
  return squads;
}

export async function simulateSeason(name: string, managers: number): Promise<number[]> {
  const season = await loadSeasonWithPrior(name);
  const data = season.replayData();
  const cache = new Map<number, ProjectedPlayer[]>();
  const at = (gw: number) => cache.get(gw) ?? cache.set(gw, projected(season, gw)).get(gw)!;
  return startingSquads(at(1), managers).map((squad) => {
    const purchasePrices = Object.fromEntries(squad.map((id) => [id, data.price(id, 1)]));
    const bank = 100 - squad.reduce((s, id) => s + data.price(id, 1), 0);
    return followAdvisor(data, (state) => adviseWeek(at(state.gw), state).advice, {
      squad, purchasePrices, bank, freeTransfers: 1,
    }, 2, season.maxGw).total;
  });
}

if (process.argv[1]?.endsWith('simulate.ts')) {
  const args = process.argv.slice(2);
  const mIndex = args.indexOf('--managers');
  const managers = mIndex >= 0 ? Number(args[mIndex + 1]) : 10;
  const seasons = args.filter((a, i) => !a.startsWith('--') && i !== mIndex + 1);
  for (const name of seasons.length ? seasons : ['2023-24', '2024-25', '2025-26']) {
    const totals = await simulateSeason(name, managers);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    console.log(`${name}: mean ${mean.toFixed(0)} pts over GW2-end (${managers} managers, no chips) — ${totals.join(', ')}`);
  }
}
