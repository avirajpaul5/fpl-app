import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useAppStore } from '@/store/index.ts';
import { fetchTrack, type TrackMove, type TrackResponse } from '@/api/index.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card.tsx';
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { formatDeadline, signed } from '@/lib/format.ts';

const chartConfig = {
  projected: { label: 'Projected', color: 'var(--chart-2)' },
  actual: { label: 'Actual average', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function Moves({ moves, players }: { moves: TrackMove[]; players: TrackResponse['players'] }) {
  if (moves.length === 0) return <span className="text-muted-foreground">Roll</span>;
  const name = (id: number) => players[id]?.name ?? `#${id}`;
  return (
    <div className="space-y-0.5">
      {moves.map((m) => (
        <div key={`${m.out}-${m.in}`} className="whitespace-nowrap">
          <span className="text-muted-foreground">{name(m.out)}</span> → {name(m.in)}
        </div>
      ))}
    </div>
  );
}

function Delta({ value }: { value: number }) {
  return <span className={`tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>{signed(value, 0)}</span>;
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
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Track record needs your team</CardTitle>
            <CardDescription>Enter your FPL team ID on the This Week page first.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Track record</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          How the app’s advice would have played out for your team this season. Each week is rebuilt from scratch using only matches that had finished before that week’s deadline — the same model that makes this week’s recommendation.
        </p>
      </div>

      {isLoading && (
        <div role="status" aria-label="Replaying your season" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      )}
      {isError && <Alert variant="destructive"><AlertTitle>Could not build the track record</AlertTitle><AlertDescription>{error?.message}</AlertDescription></Alert>}
      {data && !data.ready && <Alert><AlertTitle>Not enough gameweeks yet</AlertTitle><AlertDescription>{data.message}</AlertDescription></Alert>}

      {data?.ready && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Follow the app · GW{data.fromGw}–{data.toGw}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {data.summary.followPoints} <span className="text-base font-normal text-muted-foreground">vs {data.summary.yourPoints}</span>
                </CardTitle>
              </CardHeader>
              <CardFooter className="text-xs text-muted-foreground">
                <span>Its transfers, lineup and captain each week (your chips kept): <Delta value={data.summary.followDiff} /> vs your actual points.</span>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Suggested transfers</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  <Delta value={data.summary.appMovesRealised} /> <span className="text-base font-normal text-muted-foreground">vs {signed(data.summary.yourMovesRealised, 0)}</span>
                </CardTitle>
              </CardHeader>
              <CardFooter className="text-xs text-muted-foreground">
                Points the suggested signings outscored the players they replaced over the next 4 GWs, summed per week — vs your own moves after hits.
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Captaincy</CardDescription>
                <CardTitle className="text-2xl"><Delta value={data.summary.captainDelta} /></CardTitle>
              </CardHeader>
              <CardFooter className="text-xs text-muted-foreground">
                Points from captaining its pick instead of yours, in your actual lineup, over {data.summary.captainWeeks} weeks.
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Projection accuracy</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {data.accuracy.modelCorrelation.toFixed(2)} <span className="text-base font-normal text-muted-foreground">vs {data.accuracy.formCorrelation.toFixed(2)}</span>
                </CardTitle>
              </CardHeader>
              <CardFooter className="text-xs text-muted-foreground">
                Correlation with actual points this season, vs FPL’s own expected points (which equal player form). Higher is better.
              </CardFooter>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Week by week</CardTitle>
              <CardDescription>
                “Suggested” is what the app would have advised for your real squad before each deadline; “realised” compares the points of players bought vs sold over the following weeks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gameweek</TableHead>
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
                      <TableRow key={w.gw} className="align-top">
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium">
                            GW{w.gw}
                            {w.chip && <Badge variant="outline">{w.chip}</Badge>}
                          </div>
                          {w.deadline && <div className="text-xs text-muted-foreground">before {formatDeadline(w.deadline)}</div>}
                          <div className="text-xs text-muted-foreground">
                            results to GW{w.resultsThroughGw} · {w.freeTransfers} FT
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{w.you.points}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {w.follow.points}
                          <div className="text-xs"><Delta value={w.follow.points - w.you.points} /></div>
                        </TableCell>
                        <TableCell>
                          <Moves moves={w.you.transfers} players={data.players} />
                          {w.you.hits > 0 && <Badge variant="destructive" className="mt-1">−{w.you.hits * 4}</Badge>}
                        </TableCell>
                        <TableCell title={w.app.reason}>
                          {audited ? <Moves moves={w.app.transfers} players={data.players} /> : <span className="text-muted-foreground">Chip week</span>}
                          {w.app.hits > 0 && <Badge variant="destructive" className="mt-1">−{w.app.hits * 4}</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {audited ? <><Delta value={w.app.movesRealised} /> / <Delta value={w.you.movesRealised} /></> : '—'}
                          <div className="text-xs text-muted-foreground">over {w.windowGws} GW{w.windowGws === 1 ? '' : 's'}</div>
                        </TableCell>
                        <TableCell>
                          {name(w.you.captain)} ({w.you.captainPoints}) / {name(w.app.captain)} ({w.app.captainPoints})
                          {w.app.captainDelta !== 0 && <div className="text-xs"><Delta value={w.app.captainDelta} /></div>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Are the projections honest?</CardTitle>
              <CardDescription>
                Players grouped by projected points for the next gameweek, against what they actually scored ({data.accuracy.n.toLocaleString()} player-weeks this season). Average error {data.accuracy.modelMae.toFixed(2)} pts vs {data.accuracy.formMae.toFixed(2)} for FPL’s own figure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart accessibilityLayer data={data.accuracy.buckets}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="projected" fill="var(--color-projected)" radius={4} />
                  <Bar dataKey="actual" fill="var(--color-actual)" radius={4} />
                </BarChart>
              </ChartContainer>
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
