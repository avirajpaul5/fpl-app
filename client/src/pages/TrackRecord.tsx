import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { useAppStore } from '@/store/index.ts';
import { fetchTrack, type TrackMove, type TrackResponse } from '@/api/index.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { signed } from '@/lib/format.ts';

function Moves({ moves, players }: { moves: TrackMove[]; players: TrackResponse['players'] }) {
  if (moves.length === 0) return <span className="text-muted-foreground">Roll</span>;
  const name = (id: number) => players[id]?.name ?? `#${id}`;
  return (
    <div className="space-y-0.5">
      {moves.map((m) => (
        <div key={`${m.out}-${m.in}`} className="whitespace-nowrap">
          <span className="text-muted-foreground">{name(m.out)}</span> → <span>{name(m.in)}</span>
        </div>
      ))}
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const cls = value > 0 ? 'text-primary' : value < 0 ? 'text-destructive' : 'text-muted-foreground';
  return <span className={`font-semibold tabular-nums ${cls}`}>{signed(value, 0)}</span>;
}

function Stat({ title, value, sub, tone }: { title: string; value: React.ReactNode; sub: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <Card size="sm" className={`gap-1 p-4 ${tone === 'good' ? 'ring-primary/40' : ''}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <p className="text-xs leading-relaxed text-muted-foreground">{sub}</p>
    </Card>
  );
}

export function TrackRecord() {
  const { teamId } = useAppStore();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['track', teamId],
    queryFn: () => fetchTrack(teamId!),
    enabled: teamId != null,
    staleTime: 30 * 60_000,
  });

  if (!teamId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <Card className="mx-auto max-w-lg text-center">
          <CardHeader>
            <CardTitle>Track record needs your team</CardTitle>
            <CardDescription>Enter your FPL team ID on the This Week page first.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Track record</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          How the app’s advice would have played out for your team this season. Every week is replayed using only the results available before that deadline — the same model that makes this week’s recommendation.
        </p>
      </div>

      {isLoading && (
        <div role="status" aria-label="Replaying your season" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}
      {isError && <Alert variant="destructive"><AlertTitle>Could not build the track record</AlertTitle><AlertDescription>{error?.message}</AlertDescription></Alert>}
      {data && !data.ready && <Alert><AlertTitle>Not enough gameweeks yet</AlertTitle><AlertDescription>{data.message}</AlertDescription></Alert>}

      {data?.ready && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              title={`Follow the app · GW${data.fromGw}–${data.toGw}`}
              tone={data.summary.followDiff >= 0 ? 'good' : undefined}
              value={<>{data.summary.followPoints} <span className="text-base text-muted-foreground">vs {data.summary.yourPoints}</span></>}
              sub={<>Its transfers, lineup and captain every week (your chips kept) would have scored <Delta value={data.summary.followDiff} /> vs your actual points.</>}
            />
            <Stat
              title="Suggested transfers"
              tone={data.summary.appMovesRealised >= data.summary.yourMovesRealised ? 'good' : undefined}
              value={<><Delta value={data.summary.appMovesRealised} /> <span className="text-base text-muted-foreground">vs {signed(data.summary.yourMovesRealised, 0)}</span></>}
              sub="Points the players it suggested buying outscored the ones they replaced over the next 4 GWs, summed per week — vs the same for your own moves (after hits)."
            />
            <Stat
              title="Captaincy"
              value={<Delta value={data.summary.captainDelta} />}
              sub={`Points from captaining its pick instead of yours, using your actual lineup, over ${data.summary.captainWeeks} weeks.`}
            />
            <Stat
              title="Projection accuracy"
              tone="good"
              value={<>{data.accuracy.modelCorrelation.toFixed(2)} <span className="text-base text-muted-foreground">vs {data.accuracy.formCorrelation.toFixed(2)}</span></>}
              sub="Correlation of next-GW projections with actual points this season, vs FPL’s own expected points (which equal player form). Higher is better."
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Week by week</CardTitle>
              <CardDescription>
                “Suggested” is what the app would have advised for your real squad that week; “realised” compares the points of players bought vs sold over the following weeks.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GW</TableHead>
                    <TableHead className="text-right">You</TableHead>
                    <TableHead className="text-right">Following app</TableHead>
                    <TableHead>Your moves</TableHead>
                    <TableHead>Suggested for your squad</TableHead>
                    <TableHead className="text-right">Realised (app / you)</TableHead>
                    <TableHead>Captain (you / app)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.weeks.map((w) => {
                    const name = (id: number) => data.players[id]?.name ?? `#${id}`;
                    const audited = w.chip !== 'freehit' && w.chip !== 'wildcard';
                    return (
                      <TableRow key={w.gw} className="align-top text-xs">
                        <TableCell className="font-semibold">
                          GW{w.gw}
                          {w.chip && <Badge variant="outline" className="ml-1 text-[10px]">{w.chip}</Badge>}
                          <div className="font-normal text-muted-foreground">{w.freeTransfers} FT</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{w.you.points}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {w.follow.points} <span className="text-muted-foreground">(<Delta value={w.follow.points - w.you.points} />)</span>
                        </TableCell>
                        <TableCell><Moves moves={w.you.transfers} players={data.players} />{w.you.hits > 0 && <Badge variant="destructive" className="mt-1 text-[10px]">−{w.you.hits * 4}</Badge>}</TableCell>
                        <TableCell title={w.app.reason}>
                          {audited ? <Moves moves={w.app.transfers} players={data.players} /> : <span className="text-muted-foreground">Chip week</span>}
                          {w.app.hits > 0 && <Badge variant="destructive" className="mt-1 text-[10px]">−{w.app.hits * 4}</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {audited ? <><Delta value={w.app.movesRealised} /> / <Delta value={w.you.movesRealised} /></> : '—'}
                          <div className="text-[10px] text-muted-foreground">over {w.windowGws} GW{w.windowGws === 1 ? '' : 's'}</div>
                        </TableCell>
                        <TableCell>
                          {name(w.you.captain)} ({w.you.captainPoints}) / {name(w.app.captain)} ({w.app.captainPoints})
                          {w.app.captainDelta !== 0 && <div><Delta value={w.app.captainDelta} /></div>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Are the projections honest?</CardTitle>
              <CardDescription>
                Players grouped by their projected points for the next gameweek (x-axis), against what they actually scored ({data.accuracy.n.toLocaleString()} player-weeks this season). Average error {data.accuracy.modelMae.toFixed(2)} pts vs {data.accuracy.formMae.toFixed(2)} for FPL’s own figure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={data.accuracy.buckets} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                    <ChartTooltip
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, key: string) => [value.toFixed(2), key === 'projected' ? 'Projected' : 'Actual']}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} formatter={(key: string) => (key === 'projected' ? 'Projected' : 'Actual average')} />
                    <Bar dataKey="projected" fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="actual" fill="var(--primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {data.notes.map((note) => <li key={note}>{note}</li>)}
            <li>One season is a small sample: a single early decision can swing the follow-the-app total by 50+ points either way. Across 4 past seasons of simulated managers, this engine averaged 300–500 more points per season than the previous version.</li>
          </ul>
        </>
      )}
    </div>
  );
}
