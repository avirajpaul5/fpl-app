import { Router, Request, Response } from 'express';

// Remembers the visitor's FPL team ID in a first-party cookie set by the
// server. Browsers keep these far longer than script-written storage (Safari
// clears localStorage after 7 days without a visit), so the app can restore
// the team for weekly visitors.
const COOKIE = 'fpl_team';
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // the longest lifetime browsers allow

const router = Router();

function readTeamId(req: Request): number | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === COOKIE) {
      const id = Number(value);
      return Number.isInteger(id) && id > 0 ? id : null;
    }
  }
  return null;
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
  };
}

router.get('/', (req: Request, res: Response) => {
  res.json({ teamId: readTeamId(req) });
});

router.put('/', (req: Request, res: Response) => {
  const teamId = Number(req.body?.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    res.status(400).json({ error: 'teamId must be a positive integer' });
    return;
  }
  res.cookie(COOKIE, String(teamId), { ...cookieOptions(req), maxAge: MAX_AGE_MS });
  res.json({ teamId });
});

router.delete('/', (req: Request, res: Response) => {
  res.clearCookie(COOKIE, cookieOptions(req));
  res.json({ teamId: null });
});

export default router;
