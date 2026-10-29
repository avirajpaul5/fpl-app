import { useQuery } from '@tanstack/react-query';
import { CircleHelp } from 'lucide-react';
import { useAppStore } from '@/store/index.ts';
import { fetchDeadlineRecommend } from '@/api/index.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { ConfidencePill } from '@/components/ConfidencePill.tsx';
import { ChipGridSkeleton } from '@/components/LoadingSkeletons.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip.tsx';

const CHIP_META = {
  wildcard: {
    label: 'Wildcard',
    icon: '🃏',
    description: 'Rebuild your whole squad for free. The app builds the best squad your budget allows and compares it with what your free transfers can achieve over the next 8 GWs.',
    guardrail: 'Recommended only when the rebuild beats your free transfers by 15+ projected points — or when a first-half Wildcard is about to expire unused.',
    guardrailTooltip: 'A Wildcard is irreversible and projections are noisy, so the bar is deliberately high. The first-half Wildcard expires after GW19.',
  },
  freeHit: {
    label: 'Free Hit',
    icon: '🎯',
    description: 'A one-week squad that reverts afterwards. The app builds the best one-week team for each upcoming GW and compares it with your own XI.',
    guardrail: 'Recommended only when a week gains 12+ projected points — in practice a blank or double gameweek.',
    guardrailTooltip: null,
  },
  benchBoost: {
    label: 'Bench Boost',
    icon: '📈',
    description: 'All 15 players score. The app projects your bench for every upcoming GW and points to the strongest week.',
    guardrail: 'Play-now only when this week is the best in sight and your bench projects 12+ points (usually a double gameweek).',
    guardrailTooltip: null,
  },
  tripleCaptain: {
    label: 'Triple Captain',
    icon: '©',
    description: 'Your captain scores triple. The app finds the week your best captain projects highest.',
    guardrail: 'Play-now only when this week is the best in sight and the captain projects 9+ points. Single-week hauls are volatile — treat it as a nudge.',
    guardrailTooltip: null,
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
          Chips are scored on your squad's projections for the coming weeks. Chips you've already used in this half of the season (they refresh at GW20) are shown as unavailable.
        </p>
      </div>

      {isLoading && <ChipGridSkeleton />}
      {isError && <Alert variant="destructive"><AlertTitle>Could not load chip advice</AlertTitle><AlertDescription>{error?.message}</AlertDescription></Alert>}

      {data && (
        <TooltipProvider>
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
                        <AlertTitle className="flex items-center gap-1.5">
                          <span>{chip.reason.startsWith('Not available') ? 'Not available' : 'Hold'}</span>
                          {meta.guardrailTooltip ? (
                            <Tooltip>
                              <TooltipTrigger
                                aria-label={`Why is the ${meta.label} guardrail active?`}
                                closeOnClick={false}
                                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                              >
                                <CircleHelp aria-hidden="true" className="size-3.5" />
                              </TooltipTrigger>
                              <TooltipContent side="bottom" align="start">
                                {meta.guardrailTooltip}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </AlertTitle>
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
        </TooltipProvider>
      )}
    </div>
  );
}
