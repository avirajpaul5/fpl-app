import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/index.ts';
import { fetchDeadlineRecommend, fetchHealth, fetchPlayers, fetchTeam } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { PosBadge } from '@/components/PosBadge.tsx';
import { XpBar } from '@/components/XpBar.tsx';
import { ConfidencePill } from '@/components/ConfidencePill.tsx';
import { StatusDot } from '@/components/StatusDot.tsx';
import { TeamIdInput } from '@/components/TeamIdInput.tsx';
import { DeadlineSetup } from '@/components/DeadlineSetup.tsx';

const posRowCls: Record<string, string> = {
  GK:  'border-l-2 border-l-white/30',
  DEF: 'border-l-2 border-l-white/30',
  MID: 'border-l-2 border-l-white/30',
  FWD: 'border-l-2 border-l-white/30',
};

export function Dashboard() {
  const {
    teamId,
    draftTeamId,
    draftSquadIds,
    bank,
    freeTransfers,
    sellingPrices,
    chipAvailability,
  } = useAppStore();
  const qc = useQueryClient();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    staleTime: 60_000,
  });

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

  const draftReady = teamId != null && draftTeamId === teamId &&
    draftSquadIds.length === 15 && bank != null;
  const recommend = useQuery({
    queryKey: ['recommend', teamId, draftSquadIds, bank, freeTransfers, sellingPrices, chipAvailability],
    queryFn: () => fetchDeadlineRecommend(teamId!, {
      squadIds: draftSquadIds,
      bank: bank!,
      freeTransfers,
      sellingPrices,
      chipAvailability,
    }),
    enabled: draftReady,
    staleTime: 5 * 60_000,
  });

  if (!teamId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <Card className="mx-auto max-w-lg text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">FPL Decision Engine</CardTitle>
            <CardDescription className="leading-relaxed">
            Enter your FPL team ID to get captain picks, transfer recommendations, chip timing advice, and your best starting XI — all driven by the validated decision engine.
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
            GW{health.data?.currentGw ?? '—'}
          </Badge>
          <TeamIdInput />
        </div>
        <div className="flex items-center gap-3">
          {health.data && (
            <span className="text-xs text-muted-foreground">
              Data refreshed {new Date(health.data.timestamp).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries()}
            className="h-8 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {team.data && players.data && (
        <DeadlineSetup team={team.data} allPlayers={players.data.players} />
      )}

      {(team.isLoading || players.isLoading || (team.data && !draftReady)) && (
        <Card><CardContent className="space-y-3 py-6"><Skeleton className="h-4 w-52" /><Skeleton className="h-20 w-full" /></CardContent></Card>
      )}

      {team.isError && (
        <Alert variant="destructive"><AlertTitle>Could not load your team</AlertTitle><AlertDescription>{team.error?.message ?? 'Failed to load team'}</AlertDescription></Alert>
      )}

      {recommend.isLoading && (
        <Card><CardContent className="space-y-3 py-6"><Skeleton className="h-4 w-40" /><Skeleton className="h-28 w-full" /></CardContent></Card>
      )}
      {recommend.isError && (
        <Alert variant="destructive"><AlertTitle>Could not load recommendations</AlertTitle><AlertDescription>{recommend.error?.message ?? 'Failed to load'}</AlertDescription></Alert>
      )}

      {recommend.data && (
        <>
          {/* Captain card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Captain Pick
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {recommend.data.captain.topThree.map((item, i) => (
                  <Card
                    key={item.player.id}
                    size="sm"
                    className={`p-4 ${
                      i === 0 ? 'ring-primary/50 bg-primary/5' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          {i === 0 && <span className="text-foreground text-xs font-bold">© C</span>}
                          {i === 1 && <span className="text-muted-foreground text-xs font-bold">VC</span>}
                          <span className="font-semibold text-sm">{item.player.name}</span>
                          <StatusDot status={item.player.status} chanceNext={item.player.chanceNext} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <PosBadge pos={item.player.pos} />
                          <span className="text-xs text-muted-foreground">{item.player.teamName}</span>
                          <span className="text-xs text-muted-foreground">£{item.player.price.toFixed(1)}m</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary tabular-nums">{item.projXp.toFixed(1)}</div>
                        <div className="text-[10px] text-muted-foreground">xP next GW</div>
                      </div>
                    </div>
                    <XpBar value={item.projXp} max={12} />
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Transfer suggestions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Transfer Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recommend.data.transfers.moves.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-primary text-base">✓</span>
                  Bank your free transfer — no projected 5-GW gain exceeds the threshold.
                </div>
              ) : (
                <div className="space-y-2">
                  {recommend.data.transfers.moves.map((move, i) => (
                    <Card
                      key={i}
                      size="sm"
                      className="flex-row flex-wrap items-center gap-3 bg-muted/20 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PosBadge pos={move.out.pos} />
                        <span className="truncate text-sm font-medium text-muted-foreground">{move.out.name}</span>
                        <span className="text-xs text-muted-foreground">sell £{move.outSellingPrice.toFixed(1)}m</span>
                      </div>
                      <span className="text-muted-foreground text-sm">→</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-primary font-medium text-sm truncate">{move.in.name}</span>
                        <span className="text-xs text-muted-foreground">£{move.in.price.toFixed(1)}m</span>
                        <StatusDot status={move.in.status} chanceNext={move.in.chanceNext} />
                      </div>
                      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-primary font-semibold text-sm tabular-nums">+{move.gain.toFixed(1)}</div>
                          <div className="text-[10px] text-muted-foreground">5-GW gain</div>
                        </div>
                        {move.tookHit && (
                          <Badge variant="destructive" className="text-[10px]">−4 hit</Badge>
                        )}
                        <div className="text-right">
                          <div className={`font-semibold text-sm tabular-nums ${move.netGain > 0 ? 'text-primary' : 'text-destructive'}`}>
                            {move.netGain > 0 ? '+' : ''}{move.netGain.toFixed(1)} net
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {recommend.data.transfers.projNetGain <= 0 && (
                    <Alert><AlertDescription>Net projected gain ≤ 0 — consider banking the transfer instead.</AlertDescription></Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chip strip */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Chip Advice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(
                  [
                    { key: 'wildcard',      label: 'Wildcard',        icon: '🃏' },
                    { key: 'freeHit',       label: 'Free Hit',        icon: '🎯' },
                    { key: 'benchBoost',    label: 'Bench Boost',     icon: '📈' },
                    { key: 'tripleCaptain', label: 'Triple Captain',  icon: '©' },
                  ] as const
                ).map(({ key, label, icon }) => {
                  const chip = recommend.data!.chips[key];
                  return (
                    <Card
                      key={key}
                      size="sm"
                      className={`p-4 ${
                        chip.recommend ? 'bg-primary/5 ring-primary/50' : 'bg-muted/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{icon} {label}</span>
                        <ConfidencePill confidence={chip.confidence} />
                      </div>
                      {chip.recommend ? (
                        <div className="text-primary text-xs font-medium">
                          ✓ Play GW{chip.gw} · +{chip.projectedValue.toFixed(1)} xP
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-xs">Hold</div>
                      )}
                      <p className="text-xs text-muted-foreground leading-relaxed">{chip.reason}</p>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Starting XI */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Best Starting XI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {recommend.data.xi.starters.map((p) => {
                  const isCap = p.id === recommend.data!.xi.captain.id;
                  const isVc  = p.id === recommend.data!.xi.viceCaptain.id && !isCap;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md ${posRowCls[p.pos]}`}
                    >
                      <PosBadge pos={p.pos} />
                      <span className="font-medium text-sm flex-1">{p.name}</span>
                      {isCap && <Badge className="text-[10px]">© C</Badge>}
                      {isVc  && <Badge variant="outline" className="text-[10px] text-muted-foreground">VC</Badge>}
                      <StatusDot status={p.status} chanceNext={p.chanceNext} />
                      <span className="text-xs text-muted-foreground hidden sm:inline">{p.teamName}</span>
                      <span className="text-xs font-semibold text-primary tabular-nums w-14 text-right">
                        {p.epNext.toFixed(1)} xP
                      </span>
                      <span className="text-xs text-muted-foreground w-14 text-right tabular-nums">
                        £{p.price.toFixed(1)}m
                      </span>
                    </div>
                  );
                })}
              </div>
              <Separator className="my-3" />
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bench order</p>
                {recommend.data.xi.bench.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-3 rounded-md bg-muted/25 px-3 py-2">
                    <span className="w-5 text-xs font-semibold text-muted-foreground">
                      {player.pos === 'GK' ? 'GK' : index + 1}
                    </span>
                    <PosBadge pos={player.pos} />
                    <span className="flex-1 text-sm font-medium">{player.name}</span>
                    <StatusDot status={player.status} chanceNext={player.chanceNext} />
                    <span className="w-14 text-right text-xs font-semibold text-primary tabular-nums">
                      {player.epNext.toFixed(1)} xP
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
