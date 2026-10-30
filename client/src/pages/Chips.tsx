import { useQuery } from '@tanstack/react-query';
import { CircleHelp } from 'lucide-react';
import { useAppStore } from '@/store/index.ts';
import { fetchDeadlineRecommend } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { confidenceVariant } from '@/lib/format.ts';
import { ChipGridSkeleton } from '@/components/LoadingSkeletons.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx';

const CHIP_META = {
  wildcard: {
    label: 'Wildcard',
    description: 'Rebuild your whole squad for free. The app builds the best squad your budget allows and compares it with what your free transfers can achieve over the next 8 GWs.',
    guardrail: 'Recommended only when the rebuild beats your free transfers by 15+ projected points — or when a first-half Wildcard is about to expire unused.',
    guardrailTooltip: 'A Wildcard is irreversible and projections are noisy, so the bar is deliberately high. The first-half Wildcard expires after GW19.',
  },
  freeHit: {
    label: 'Free Hit',
    description: 'A one-week squad that reverts afterwards. The app builds the best one-week team for each upcoming GW and compares it with your own XI.',
    guardrail: 'Recommended only when a week gains 12+ projected points — in practice a blank or double gameweek.',
    guardrailTooltip: null,
  },
  benchBoost: {
    label: 'Bench Boost',
    description: 'All 15 players score. The app projects your bench for every upcoming GW and points to the strongest week.',
    guardrail: 'Play-now only when this week is the best in sight and your bench projects 12+ points (usually a double gameweek).',
    guardrailTooltip: null,
  },
  tripleCaptain: {
    label: 'Triple Captain',
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(data.chips) as Array<keyof typeof data.chips>).map((key) => {
              const chip = data.chips[key];
              const meta = CHIP_META[key];
              return (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle>{meta.label}</CardTitle>
                    <CardDescription>{meta.description}</CardDescription>
                    <CardAction>
                      <Badge variant={confidenceVariant(chip.confidence)}>{chip.confidence}</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Status box */}
                    <Alert>
                      {chip.recommend ? (
                        <>
                          <AlertTitle>Recommended: play GW{chip.gw}</AlertTitle>
                          <AlertDescription>Projected value: +{chip.projectedValue.toFixed(1)} pts</AlertDescription>
                        </>
                      ) : (
                        <AlertTitle className="flex items-center gap-1.5">
                          <span>{chip.reason.startsWith('Not available') ? 'Not available' : 'Hold'}</span>
                          {meta.guardrailTooltip ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={<Button variant="ghost" size="icon-xs" aria-label={`Why is the ${meta.label} bar set this high?`} />}
                              >
                                <CircleHelp aria-hidden="true" />
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
                        <p className="text-xs text-muted-foreground">{meta.guardrail}</p>
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
