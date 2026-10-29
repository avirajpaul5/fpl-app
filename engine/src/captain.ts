import { ProjectedPlayer, CaptainPick } from './types.js';

const CAPTAIN_POSITION_TIE_BREAK: Record<ProjectedPlayer['pos'], number> = {
  FWD: 0,
  MID: 1,
  DEF: 2,
  GK: 3,
};

function compareCaptainCandidates(
  a: { player: ProjectedPlayer; projXp: number },
  b: { player: ProjectedPlayer; projXp: number }
): number {
  const xpDifference = b.projXp - a.projXp;
  if (Math.abs(xpDifference) > 0.001) return xpDifference;

  const positionDifference =
    CAPTAIN_POSITION_TIE_BREAK[a.player.pos] - CAPTAIN_POSITION_TIE_BREAK[b.player.pos];
  if (positionDifference !== 0) return positionDifference;

  return b.player.ownership - a.player.ownership;
}

// Captain = argmax(starter.projByGw[gwIndex]). Exact ties prefer attacking
// positions, then ownership, so squad ordering cannot accidentally captain a GK.
export function pickCaptain(starters: ProjectedPlayer[], gwIndex: number = 0): CaptainPick {
  const projected = starters.map((p) => ({ player: p, projXp: p.projByGw[gwIndex] ?? 0 }));

  projected.sort(compareCaptainCandidates);

  const captain = projected[0]?.player ?? starters[0]!;
  const viceCaptain = projected[1]?.player ?? starters[1] ?? captain;
  const topThree = projected.slice(0, 3);

  return { captain, viceCaptain, topThree };
}
