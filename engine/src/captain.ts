import { Player, CaptainPick } from './types.js';
import { projectPlayer } from './projection.js';

// Captain = argmax(starter.projByGw[0])
// No premium-bias adjustment (tested, no gain).
export function pickCaptain(starters: Player[]): CaptainPick {
  const projected = starters.map((p) => ({
    player: p,
    projXp: projectPlayer(p, 1).projByGw[0] ?? 0,
  }));

  projected.sort((a, b) => b.projXp - a.projXp);

  const captain = projected[0]?.player ?? starters[0]!;
  const viceCaptain = projected[1]?.player ?? starters[1] ?? captain;
  const topThree = projected.slice(0, 3);

  return { captain, viceCaptain, topThree };
}
