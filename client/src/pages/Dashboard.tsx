import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/index.ts';
import { fetchDeadlineRecommend, fetchPlayers, fetchTeam, fetchTrack, type TransferMove } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import { PosBadge } from '@/components/PosBadge.tsx';
import { XpBar } from '@/components/XpBar.tsx';
import { ConfidencePill } from '@/components/ConfidencePill.tsx';
import { StatusDot } from '@/components/StatusDot.tsx';
import { TeamIdInput } from '@/components/TeamIdInput.tsx';
import { DeadlineSetup } from '@/components/DeadlineSetup.tsx';
import { PlanCard } from '@/components/PlanCard.tsx';
import { XpBreakdown } from '@/components/XpBreakdown.tsx';
import { DeadlineSetupSkeleton, RecommendationSkeleton } from '@/components/LoadingSkeletons.tsx';
import { formatDeadline, signed, timeUntil } from '@/lib/format.ts';

const CHIPS = [
  { key: 'wildcard', label: 'Wildcard' },
  { key: 'freeHit', label: 'Free Hit' },
  { key: 'benchBoost', label: 'Bench Boost' },
  { key: 'tripleCaptain', label: 'Triple Captain' },
] as const;

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
      <div className="mx-auto max-w-6xl px-4 py-20">
        <Card className="mx-auto max-w-lg text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Your weekly FPL plan</CardTitle>
            <CardDescription className="leading-relaxed">
              Enter your FPL team ID for this week’s transfers, captain and lineup — plus a season track record showing how the advice would have played out for your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <TeamIdInput />
            </div>
            <p className="text-xs text-muted-foreground">
              Your team ID is in the FPL URL: fantasy.premierleague.com/entry/<strong>XXXXXX</strong>/event/…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = recommend.data;
  const deadline = data?.deadline ?? team.data?.deadline ?? null;
  const summary = track.data?.ready ? track.data.summary : null;

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {team.data && (
                <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold">GW{team.data.gw}</Badge>
              )}
              {team.data?.manager.teamName && (
                <span className="text-lg font-semibold tracking-tight">{team.data.manager.teamName}</span>
              )}
            </div>
            {deadline && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                Deadline {formatDeadline(deadline)} · {timeUntil(deadline)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TeamIdInput />
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries()} className="h-8 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {team.isError && (
          <Alert variant="destructive"><AlertTitle>Could not load your team</AlertTitle><AlertDescription>{team.error?.message ?? 'Failed to load team'}</AlertDescription></Alert>
        )}

        {/* Track record teaser */}
        {summary && track.data && (
          <Link to="/track" className="block">
            <Card size="sm" className="flex-row flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Track record · GW{track.data.fromGw}–{track.data.toGw}
              </span>
              <span className="text-sm">
                Following the app: <strong className="tabular-nums">{summary.followPoints}</strong> pts vs your <strong className="tabular-nums">{summary.yourPoints}</strong>{' '}
                <span className={summary.followDiff >= 0 ? 'text-primary' : 'text-destructive'}>({signed(summary.followDiff, 0)})</span>
              </span>
              <span className="text-sm text-muted-foreground">
                Suggested moves <span className="tabular-nums text-foreground">{signed(summary.appMovesRealised, 0)}</span> vs yours <span className="tabular-nums text-foreground">{signed(summary.yourMovesRealised, 0)}</span>
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs text-primary">Details <ArrowRight className="size-3.5" /></span>
            </Card>
          </Link>
        )}

        {(team.isLoading || players.isLoading || recommend.isLoading || (team.data && !draftReady)) && <RecommendationSkeleton />}
        {recommend.isError && (
          <Alert variant="destructive"><AlertTitle>Could not load recommendations</AlertTitle><AlertDescription>{recommend.error?.message ?? 'Failed to load'}</AlertDescription></Alert>
        )}

        {data && (
          <>
            <PlanCard
              gw={data.gw}
              plan={data.transfers}
              allowHits={allowHits}
              onAllowHitsChange={setAllowHits}
              onApply={handleApply}
            />

            {/* Captain */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Captain</CardTitle>
                <CardDescription>Highest expected points in your lineup{data.transfers.moves.length > 0 ? ' after the transfers above' : ''}. Hover a score for its breakdown.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {data.captain.topThree.map((item, i) => (
                    <Card key={item.player.id} size="sm" className={`p-4 ${i === 0 ? 'bg-primary/5 ring-primary/50' : 'bg-muted/30'}`}>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {i === 0 && <Badge className="text-[10px]">C</Badge>}
                            {i === 1 && <Badge variant="outline" className="text-[10px]">VC</Badge>}
                            <span className="text-sm font-semibold">{item.player.name}</span>
                            <StatusDot status={item.player.status} chanceNext={item.player.chanceNext} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <PosBadge pos={item.player.pos} />
                            <span className="text-xs text-muted-foreground">{item.player.teamName}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <XpBreakdown player={item.player} className="cursor-help text-lg font-bold text-primary tabular-nums" />
                          <div className="text-[10px] text-muted-foreground">xP next GW</div>
                        </div>
                      </div>
                      <XpBar value={item.projXp} max={10} />
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Lineup */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Starting XI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {data.xi.starters.map((p) => {
                    const isCap = p.id === data.xi.captain.id;
                    const isVc = p.id === data.xi.viceCaptain.id && !isCap;
                    const isNew = data.transfers.moves.some((m) => m.in.id === p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-md border-l-2 border-l-white/30 px-3 py-2">
                        <PosBadge pos={p.pos} />
                        <span className="flex-1 text-sm font-medium">
                          {p.name}
                          {isNew && <Badge variant="outline" className="ml-2 text-[10px] text-primary">new</Badge>}
                        </span>
                        {isCap && <Badge className="text-[10px]">C</Badge>}
                        {isVc && <Badge variant="outline" className="text-[10px] text-muted-foreground">VC</Badge>}
                        <StatusDot status={p.status} chanceNext={p.chanceNext} />
                        <span className="hidden text-xs text-muted-foreground sm:inline">{p.teamName}</span>
                        <span className="hidden w-16 text-right text-xs text-muted-foreground tabular-nums md:inline">{Math.round(p.xMins ?? 0)} min</span>
                        <span className="w-14 text-right"><XpBreakdown player={p} /></span>
                      </div>
                    );
                  })}
                </div>
                <Separator className="my-3" />
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bench order</p>
                  {data.xi.bench.map((player, index) => (
                    <div key={player.id} className="flex items-center gap-3 rounded-md bg-muted/25 px-3 py-2">
                      <span className="w-5 text-xs font-semibold text-muted-foreground">{player.pos === 'GK' ? 'GK' : index + 1}</span>
                      <PosBadge pos={player.pos} />
                      <span className="flex-1 text-sm font-medium">{player.name}</span>
                      <StatusDot status={player.status} chanceNext={player.chanceNext} />
                      <span className="w-14 text-right"><XpBreakdown player={player} /></span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chips */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Chips</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CHIPS.map(({ key, label }) => {
                    const chip = data.chips[key];
                    const unavailable = chip.reason.startsWith('Not available');
                    return (
                      <Card key={key} size="sm" className={`p-4 ${chip.recommend ? 'bg-primary/5 ring-primary/50' : 'bg-muted/20'} ${unavailable ? 'opacity-60' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{label}</span>
                          {!unavailable && <ConfidencePill confidence={chip.confidence} />}
                        </div>
                        <div className={chip.recommend ? 'text-xs font-medium text-primary' : 'text-xs text-muted-foreground'}>
                          {unavailable ? (data.gw < 20 ? 'Used — back at GW20' : 'Used this season') : chip.recommend ? `Play this week (GW${chip.gw})` : chip.gw ? `Hold · best window GW${chip.gw}` : 'Hold'}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{chip.reason}</p>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {team.data && players.data && <DeadlineSetup team={team.data} allPlayers={players.data.players} />}
        {(team.isLoading || players.isLoading) && <DeadlineSetupSkeleton />}
      </div>
    </TooltipProvider>
  );
}
