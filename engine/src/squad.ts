import { Player, ProjectedPlayer, Squad, XI } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { projectPlayer } from './projection.js';
import { pickCaptain } from './captain.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateSquad(squad: Squad, _atPrices?: Record<number, number>): ValidationResult {
  const errors: string[] = [];
  const { players } = squad;

  if (players.length !== ENGINE_CONFIG.SQUAD_SIZE) {
    errors.push(`Squad must have exactly ${ENGINE_CONFIG.SQUAD_SIZE} players, got ${players.length}`);
  }

  // Check position quotas
  const quotaCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) {
    quotaCounts[p.pos] = (quotaCounts[p.pos] ?? 0) + 1;
  }
  for (const [pos, required] of Object.entries(ENGINE_CONFIG.SQUAD_QUOTA)) {
    if ((quotaCounts[pos] ?? 0) !== required) {
      errors.push(`${pos} quota: need ${required}, got ${quotaCounts[pos] ?? 0}`);
    }
  }

  // Check club cap (≤3 per club)
  const clubCounts: Record<number, number> = {};
  for (const p of players) {
    clubCounts[p.team] = (clubCounts[p.team] ?? 0) + 1;
    if (clubCounts[p.team] > ENGINE_CONFIG.MAX_PER_CLUB) {
      errors.push(`Too many players from team ${p.team} (max ${ENGINE_CONFIG.MAX_PER_CLUB})`);
    }
  }

  // Check total price ≤ £100m
  const totalPrice = players.reduce((sum, p) => sum + p.price, 0);
  if (totalPrice > ENGINE_CONFIG.BUDGET + 0.001) {
    errors.push(`Squad costs £${totalPrice.toFixed(1)}m, exceeds £${ENGINE_CONFIG.BUDGET}m budget`);
  }

  // Check no duplicate players (compare by id, not object identity)
  const ids = new Set<number>();
  for (const p of players) {
    if (ids.has(p.id)) {
      errors.push(`Duplicate player id ${p.id} (${p.name})`);
    }
    ids.add(p.id);
  }

  return { ok: errors.length === 0, errors };
}

export function bestXI(squad: Squad, gwIndex: number = 0): XI {
  const projected = squad.players.map((p) => projectPlayer(p, gwIndex + 1));

  // Sort by projected xP for the given GW, descending
  const sorted = [...projected].sort((a, b) => (b.projByGw[gwIndex] ?? 0) - (a.projByGw[gwIndex] ?? 0));

  // Formation bounds from config
  const minPos: Record<string, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
  const maxPos: Record<string, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };

  const starters: ProjectedPlayer[] = [];
  const posCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  // Phase 1: satisfy minimums in xP order
  const remaining = [...sorted];
  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    let needed = minPos[pos]!;
    for (let i = remaining.length - 1; i >= 0 && needed > 0; i--) {
      // scan from low-xP end to preserve high-xP players for phase 2
    }
    // Actually scan from high-xP end to get best players for minimums
    for (let i = 0; i < remaining.length && needed > 0; i++) {
      if (remaining[i]!.pos === pos) {
        starters.push(remaining[i]!);
        posCount[pos] = (posCount[pos] ?? 0) + 1;
        remaining.splice(i, 1);
        needed--;
        i--;
      }
    }
  }

  // Phase 2: fill remaining 11 - current slots, respecting maxima
  const slotsLeft = 11 - starters.length;
  let filled = 0;
  for (let i = 0; i < remaining.length && filled < slotsLeft; i++) {
    const p = remaining[i]!;
    const currentCount = posCount[p.pos] ?? 0;
    if (currentCount < maxPos[p.pos]!) {
      starters.push(p);
      posCount[p.pos] = currentCount + 1;
      filled++;
    }
  }

  // Sort starters: GK first, then by position order, then by xP
  const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  starters.sort((a, b) => {
    const posD = (posOrder[a.pos] ?? 0) - (posOrder[b.pos] ?? 0);
    if (posD !== 0) return posD;
    return (b.projByGw[gwIndex] ?? 0) - (a.projByGw[gwIndex] ?? 0);
  });

  const captainPick = pickCaptain(starters, gwIndex);
  const captain = captainPick.captain;
  const viceCaptain = captainPick.viceCaptain;

  const starterIds = new Set(starters.map((p) => p.id));
  const bench = projected
    .filter((p) => !starterIds.has(p.id))
    .sort((a, b) => {
      if (a.pos === 'GK' && b.pos !== 'GK') return 1;
      if (a.pos !== 'GK' && b.pos === 'GK') return -1;
      return (b.projByGw[gwIndex] ?? 0) - (a.projByGw[gwIndex] ?? 0);
    });

  return { starters, bench, captain, viceCaptain };
}

export function draftSquad(players: ProjectedPlayer[]): Squad {
  // Sort by xP-per-million (projected horizon ÷ price)
  const available = [...players]
    .filter((p) => p.price > 0 && p.projHorizon > 0)
    .sort((a, b) => b.projHorizon / b.price - a.projHorizon / a.price);

  const squad: Player[] = [];
  const posCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubCount: Record<number, number> = {};
  const addedIds = new Set<number>();

  function totalCost(): number {
    return squad.reduce((s, p) => s + p.price, 0);
  }

  function slotsRemaining(): number {
    return ENGINE_CONFIG.SQUAD_SIZE - squad.length;
  }

  function canAdd(p: Player): boolean {
    if (addedIds.has(p.id)) return false;
    if ((posCount[p.pos] ?? 0) >= ENGINE_CONFIG.SQUAD_QUOTA[p.pos]!) return false;
    if ((clubCount[p.team] ?? 0) >= ENGINE_CONFIG.MAX_PER_CLUB) return false;

    const remaining = slotsRemaining() - 1; // slots after adding this player
    const minBudgetNeeded = remaining * ENGINE_CONFIG.MIN_RESERVE_PER_SLOT;
    const budgetAfter = ENGINE_CONFIG.BUDGET - totalCost() - p.price;
    if (budgetAfter < minBudgetNeeded) return false;

    return true;
  }

  // Greedy fill by xP/£
  for (const p of available) {
    if (squad.length >= ENGINE_CONFIG.SQUAD_SIZE) break;
    if (canAdd(p)) {
      squad.push(p);
      posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;
      clubCount[p.team] = (clubCount[p.team] ?? 0) + 1;
      addedIds.add(p.id);
    }
  }

  // Fill any remaining quota gaps with cheapest valid players
  if (squad.length < ENGINE_CONFIG.SQUAD_SIZE) {
    const byPrice = [...players]
      .filter((p) => !addedIds.has(p.id))
      .sort((a, b) => a.price - b.price);

    for (const p of byPrice) {
      if (squad.length >= ENGINE_CONFIG.SQUAD_SIZE) break;
      const posNeeded =
        (posCount[p.pos] ?? 0) < ENGINE_CONFIG.SQUAD_QUOTA[p.pos]!;
      const clubOk = (clubCount[p.team] ?? 0) < ENGINE_CONFIG.MAX_PER_CLUB;
      const budgetOk = totalCost() + p.price <= ENGINE_CONFIG.BUDGET;
      if (posNeeded && clubOk && budgetOk && !addedIds.has(p.id)) {
        squad.push(p);
        posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;
        clubCount[p.team] = (clubCount[p.team] ?? 0) + 1;
        addedIds.add(p.id);
      }
    }
  }

  const result: Squad = { players: squad };

  // Guard: assert result is exactly 15 and legal
  const validation = validateSquad(result);
  if (!validation.ok) {
    throw new Error(`draftSquad produced illegal squad: ${validation.errors.join('; ')}`);
  }

  return result;
}

export function rebuildSquad(
  players: ProjectedPlayer[],
  _fromGw: number,
  _horizon: number
): Squad {
  // Same as draft but players are already projected from the given GW over the horizon
  return draftSquad(players);
}
