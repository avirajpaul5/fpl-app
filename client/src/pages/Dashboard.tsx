import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/index.ts';
import { fetchDeadlineRecommend, fetchPlayers, fetchTeam, fetchTrack, type TransferMove } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Progress } from '@/components/ui/progress.tsx';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { TeamIdInput } from '@/components/TeamIdInput.tsx';
import { DeadlineSetup } from '@/components/DeadlineSetup.tsx';
import { PlanCard } from '@/components/PlanCard.tsx';
import { Reveal } from '@/components/reveal.tsx';
import { XpBreakdown } from '@/components/XpBreakdown.tsx';
import { DeadlineSetupSkeleton, RecommendationSkeleton } from '@/components/LoadingSkeletons.tsx';
import { availability, confidenceVariant, formatDeadline, signed, timeUntil } from '@/lib/format.ts';

const CHIPS = [
  { key: 'wildcard', label: 'Wildcard' },
  { key: 'freeHit', label: 'Free Hit' },
  { key: 'benchBoost', label: 'Bench Boost' },
  { key: 'tripleCaptain', label: 'Triple Captain' },
] as const;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function Dashboard() {
  const {
    teamId,
    draftTeamId,
    draftGw,
    draftSquadIds,
    bank,
    freeTransfers,
    sellingPrices,
    chipAvailability,
    allowHits,
    setAllowHits,
    applyTransfers,
  } = useAppStore();
  const qc = useQueryClient();
  const now = useNow(30_000);

  const team = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => fetchTeam(teamId!),
    enabled: teamId != null,
    staleTime: 5 * 60_000,
  });

  const players = useQuery({
    queryKey: ['players', 'deadline-setup'],
    queryFn: () => fetchPlayers(),
    enabled: teamId != null,
    staleTime: 5 * 60_000,
  });

  const track = useQuery({
    queryKey: ['track', teamId],
    queryFn: () => fetchTrack(teamId!),
    enabled: teamId != null,
    staleTime: 30 * 60_000,
  });

  const draftReady = teamId != null && draftTeamId === teamId && team.data != null &&
    draftGw === team.data.gw && draftSquadIds.length === 15 && bank != null;
  const recommend = useQuery({
    queryKey: ['recommend', teamId, draftSquadIds, bank, freeTransfers, sellingPrices, chipAvailability, allowHits],
    queryFn: () => fetchDeadlineRecommend(teamId!, {
      squadIds: draftSquadIds,
      bank: bank!,
      freeTransfers,
      sellingPrices,
      chipAvailability,
      allowHits,
    }),
    enabled: draftReady,
    staleTime: 5 * 60_000,
  });

  // Advice is only meaningful before the deadline: once it passes, drop the
  // locked week's plan and fetch the next gameweek's.
  const deadline = recommend.data?.deadline ?? team.data?.deadline ?? null;
  const deadlineMs = deadline ? Date.parse(deadline) : null;
  const locked = deadlineMs != null && now >= deadlineMs;
  useEffect(() => {
    if (deadlineMs == null) return;
    const wait = deadlineMs - Date.now() + 2_000;
    if (wait <= 0) {
      void qc.invalidateQueries();
      return;
    }
    const timer = setTimeout(() => void qc.invalidateQueries(), Math.min(wait, 2_000_000_000));
    return () => clearTimeout(timer);
  }, [deadlineMs, qc]);

  function handleApply(moves: TransferMove[]) {
    applyTransfers(moves.map((m) => ({
      outId: m.out.id,
      outSellingPrice: m.outSellingPrice,
      inId: m.in.id,
      inPrice: m.in.price,
    })));
  }

  if (!teamId) {
    return (
      <Reveal className="mx-auto max-w-6xl px-4 py-20">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Your weekly FPL plan</CardTitle>
            <CardDescription>
              Enter your FPL team ID for this week’s transfers, captain and lineup — plus a season track record showing how the advice would have played out for your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TeamIdInput />
            <p className="text-xs text-muted-foreground">
              Your team ID is in the FPL URL: fantasy.premierleague.com/entry/<strong>XXXXXX</strong>/event/…
            </p>
          </CardContent>
        </Card>
      </Reveal>
    );
  }

  const data = locked ? undefined : recommend.data;
  const summary = track.data?.ready ? track.data.summary : null;
  const resultsThroughGw = data?.resultsThroughGw ?? team.data?.resultsThroughGw;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {team.data && <Badge>GW{team.data.gw}</Badge>}
            {team.data?.manager.teamName && (
              <h1 className="text-lg font-semibold tracking-tight">{team.data.manager.teamName}</h1>
            )}
          </div>
          {deadline && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" />
              Deadline {formatDeadline(deadline)} · {timeUntil(deadline, now)}
              {resultsThroughGw ? ` · uses results up to GW${resultsThroughGw}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TeamIdInput />
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries()}>
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
        </div>
      </div>

      {team.isError && (
        <Alert variant="destructive"><AlertTitle>Could not load your team</AlertTitle><AlertDescription>{team.error?.message ?? 'Failed to load team'}</AlertDescription></Alert>
      )}

      {locked && team.data && (
        <Alert>
          <Clock />
          <AlertTitle>The GW{team.data.gw} deadline has passed</AlertTitle>
          <AlertDescription>Its plan is locked, so it is hidden. Loading advice for the next gameweek…</AlertDescription>
        </Alert>
      )}

      {summary && track.data && (
        <Reveal>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Track record · GW{track.data.fromGw}–{track.data.toGw}</CardDescription>
            <CardTitle>
              Following the app: {summary.followPoints} pts vs your {summary.yourPoints} ({signed(summary.followDiff, 0)})
            </CardTitle>
            <CardDescription>
              Its suggested transfers outscored the players they replaced by {signed(summary.appMovesRealised, 0)} pts, vs {signed(summary.yourMovesRealised, 0)} for your own moves.
            </CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link to="/track" />} nativeButton={false}>
                Details
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
        </Reveal>
      )}

      {(team.isLoading || players.isLoading || recommend.isLoading || (team.data && !draftReady)) && <RecommendationSkeleton />}
      {recommend.isError && (
        <Alert variant="destructive"><AlertTitle>Could not load recommendations</AlertTitle><AlertDescription>{recommend.error?.message ?? 'Failed to load'}</AlertDescription></Alert>
      )}

      {data && (
        <>
          <Reveal delay={0.05}>
            <PlanCard
              gw={data.gw}
              plan={data.transfers}
              allowHits={allowHits}
              onAllowHitsChange={setAllowHits}
              onApply={handleApply}
            />
          </Reveal>

          <Reveal delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle>Captain</CardTitle>
              <CardDescription>
                Highest expected points in your lineup{data.transfers.moves.length > 0 ? ' after the transfers above' : ''}. Hover a score for its breakdown.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {data.captain.topThree.map((item, i) => (
                <Reveal key={item.player.id} delay={0.15 + i * 0.05}>
                <Card size="sm" className="h-full">
                  <CardHeader>
                    <CardDescription className="flex items-center gap-1.5">
                      {i === 0 && <Badge>Captain</Badge>}
                      {i === 1 && <Badge variant="outline">Vice</Badge>}
                      {item.player.pos} · {item.player.teamName}
                    </CardDescription>
                    <CardTitle>{item.player.name}</CardTitle>
                    <CardAction>
                      <XpBreakdown player={item.player} className="px-0 text-lg tabular-nums" />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <Progress value={Math.min(100, (item.projXp / 10) * 100)} aria-label="Expected points" />
                  </CardContent>
                </Card>
                </Reveal>
              ))}
            </CardContent>
          </Card>
          </Reveal>

          <Reveal>
          <Card>
            <CardHeader>
              <CardTitle>Starting XI</CardTitle>
              <CardDescription>Best lineup for GW{data.gw}; expected minutes account for rotation and injury risk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Pos</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="hidden sm:table-cell">Club</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Minutes</TableHead>
                    <TableHead className="text-right">xP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.xi.starters.map((p) => {
                    const flag = availability(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell><Badge variant="secondary">{p.pos}</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{p.name}</span>
                            {p.id === data.xi.captain.id && <Badge>C</Badge>}
                            {p.id === data.xi.viceCaptain.id && <Badge variant="outline">V</Badge>}
                            {data.transfers.moves.some((m) => m.in.id === p.id) && <Badge variant="outline">New</Badge>}
                            {flag && <Badge variant={flag.variant}>{flag.label}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{p.teamName}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{Math.round(p.xMins ?? 0)}</TableCell>
                        <TableCell className="text-right"><XpBreakdown player={p} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Table>
                <TableCaption>Bench order — the reserve goalkeeper sits last.</TableCaption>
                <TableBody>
                  {data.xi.bench.map((p, index) => (
                    <TableRow key={p.id}>
                      <TableCell className="w-14 text-muted-foreground">{p.pos === 'GK' ? 'GK' : index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary">{p.pos}</Badge>
                          <span>{p.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right"><XpBreakdown player={p} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </Reveal>

          <Reveal>
          <Card>
            <CardHeader>
              <CardTitle>Chips</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CHIPS.map(({ key, label }, index) => {
                const chip = data.chips[key];
                const unavailable = chip.reason.startsWith('Not available');
                const status = unavailable
                  ? (data.gw < 20 ? 'Used — back at GW20' : 'Used this season')
                  : chip.recommend ? `Play this week (GW${chip.gw})` : chip.gw ? `Hold · best window GW${chip.gw}` : 'Hold';
                return (
                  <Reveal key={key} delay={index * 0.05}>
                  <Card size="sm" className={unavailable ? 'h-full opacity-60' : 'h-full'}>
                    <CardHeader>
                      <CardTitle>{label}</CardTitle>
                      <CardDescription>{status}</CardDescription>
                      {!unavailable && (
                        <CardAction><Badge variant={confidenceVariant(chip.confidence)}>{chip.confidence}</Badge></CardAction>
                      )}
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">{chip.reason}</CardContent>
                  </Card>
                  </Reveal>
                );
              })}
            </CardContent>
          </Card>
          </Reveal>
        </>
      )}

      {team.data && players.data && (
        <Reveal>
          <DeadlineSetup team={team.data} allPlayers={players.data.players} />
        </Reveal>
      )}
      {(team.isLoading || players.isLoading) && <DeadlineSetupSkeleton />}
    </div>
  );
}
