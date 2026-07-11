import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/index.ts';
import { fetchDeadlineRecommend } from '@/api/index.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { ConfidencePill } from '@/components/ConfidencePill.tsx';

const CHIP_META = {
  wildcard: {
    label: 'Wildcard',
    icon: '🃏',
    description: 'Replace your entire squad for free. Guardrail: only recommends after GW9 with a 3-GW sustained drift ≥ 8 projected xP above the optimal rebuild.',
    guardrail: 'Un-guarded Wildcard timing can lose 66 pts/season. Guarded never dropped below +5 in backtesting, averaging +32 vs +23.',
  },
  freeHit: {
    label: 'Free Hit',
    icon: '🎯',
    description: 'One-week wildcard (squad reverts after). This is a rescue chip — fires only when ≥3 of your players have no fixture. In a blank-free season it has little value.',
    guardrail: 'Fires only on genuine blank gameweeks (≥3 blanking owned players). Otherwise held for the largest double gameweek.',
  },
  benchBoost: {
    label: 'Bench Boost',
    icon: '📈',
    description: 'All 15 players score this week. Best when your bench projects well; prefers weeks with ≥4 double-gameweek players for a +6 bonus.',
    guardrail: null,
  },
  tripleCaptain: {
    label: 'Triple Captain',
    icon: '©',
    description: 'Your captain scores triple. Confidence is intentionally LOW — single-week hauls are largely unpredictable. The app suggests a sensible DGW window, not a guarantee.',
    guardrail: '⚠ Do not treat this as a precise recommendation. Timing has a low ceiling — use this as a nudge toward a DGW, not a certainty.',
  },
} as const;

export function Chips() {
  const {
    teamId,
    draftTeamId,
    draftSquadIds,
    bank,
    freeTransfers,
    sellingPrices,
    chipAvailability,
  } = useAppStore();
  const draftReady = teamId != null && draftTeamId === teamId &&
    draftSquadIds.length === 15 && bank != null;

  const { data, isLoading, isError, error } = useQuery({
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

  if (!teamId || !draftReady) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <Card className="mx-auto max-w-lg text-center">
          <CardHeader>
            <CardTitle>Chip strategy needs your squad</CardTitle>
            <CardDescription>Complete Deadline setup on the Dashboard to see chip advice.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Chip Strategy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All timings are guarded to optimise the <em>floor</em>, not the ceiling — eliminating catastrophic mistiming.
        </p>
      </div>

      {isLoading && <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="space-y-3 py-6"><Skeleton className="h-5 w-32" /><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div>}
      {isError && <Alert variant="destructive"><AlertTitle>Could not load chip advice</AlertTitle><AlertDescription>{error?.message}</AlertDescription></Alert>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(data.chips) as Array<keyof typeof data.chips>).map((key) => {
            const chip = data.chips[key];
            const meta = CHIP_META[key];
            return (
              <Card key={key} className={chip.recommend ? 'border-primary/40' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <span>{meta.icon}</span>
                        {meta.label}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-sm">
                        {meta.description}
                      </p>
                    </div>
                    <ConfidencePill confidence={chip.confidence} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Status box */}
                  <Alert className={chip.recommend ? 'border-primary/40 bg-primary/10' : 'bg-muted/40'}>
                    {chip.recommend ? (
                      <>
                        <AlertTitle className="text-primary">
                          ✓ Recommended: Play GW{chip.gw}
                        </AlertTitle>
                        <AlertDescription>
                          Projected value: <span className="text-primary font-medium tabular-nums">+{chip.projectedValue.toFixed(1)} xP</span>
                        </AlertDescription>
                      </>
                    ) : (
                      <AlertTitle>Hold — guardrail active</AlertTitle>
                    )}
                    <AlertDescription>{chip.reason}</AlertDescription>
                  </Alert>

                  {/* Guardrail note */}
                  {meta.guardrail && (
                    <>
                      <Separator />
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{meta.guardrail}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
