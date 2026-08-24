import { Player, CaptainPick } from './types.js';
import { projectPlayer } from './projection.js';

const CAPTAIN_POSITION_TIE_BREAK: Record<Player['pos'], number> = {
  FWD: 0,
  MID: 1,
  DEF: 2,
  GK: 3,
};

function compareCaptainCandidates(
  a: { player: Player; projXp: number },
  b: { player: Player; projXp: number }
): number {
  const xpDifference = b.projXp - a.projXp;
  if (Math.abs(xpDifference) > 0.001) return xpDifference;

  const positionDifference =
    CAPTAIN_POSITION_TIE_BREAK[a.player.pos] - CAPTAIN_POSITION_TIE_BREAK[b.player.pos];
  if (positionDifference !== 0) return positionDifference;

  return b.player.ownership - a.player.ownership;
}

// Captain = argmax(starter.projByGw[0])
// No premium-bias adjustment (tested, no gain). Exact xP ties prefer attacking
// positions, then ownership, so squad ordering cannot accidentally captain a GK.
export function pickCaptain(starters: Player[], gwIndex: number = 0): CaptainPick {
  const projected = starters.map((p) => ({
    player: p,
    projXp: projectPlayer(p, gwIndex + 1).projByGw[gwIndex] ?? 0,
  }));

  projected.sort(compareCaptainCandidates);

  const captain = projected[0]?.player ?? starters[0]!;
  const viceCaptain = projected[1]?.player ?? starters[1] ?? captain;
  const topThree = projected.slice(0, 3);

  return { captain, viceCaptain, topThree };
}
