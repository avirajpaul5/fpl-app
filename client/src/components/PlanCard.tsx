import { ArrowRight, Check } from 'lucide-react';
import type { TransferMove, TransferPlan } from '@/api/index.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { Label } from '@/components/ui/label.tsx';
import { PosBadge } from '@/components/PosBadge.tsx';
import { StatusDot } from '@/components/StatusDot.tsx';
import { XpBreakdown } from '@/components/XpBreakdown.tsx';
import { signed } from '@/lib/format.ts';

interface Props {
  gw: number;
  plan: TransferPlan;
  allowHits: boolean;
  onAllowHitsChange: (allow: boolean) => void;
  onApply: (moves: TransferMove[]) => void;
}

const HEADLINE: Record<TransferPlan['recommendation'], string> = {
  bank: 'Roll your transfer',
  transfer: 'Make transfers',
  hit: 'Worth a hit',
};

function optionLabel(transfers: number): string {
  return transfers === 0 ? 'Roll' : `${transfers} transfer${transfers === 1 ? '' : 's'}`;
}

export function PlanCard({ gw, plan, allowHits, onAllowHitsChange, onApply }: Props) {
  const chosen = plan.moves.length;
  return (
    <Card className="ring-primary/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              GW{gw} transfers
            </CardTitle>
            <p className="text-xl font-semibold tracking-tight">
              {plan.recommendation === 'transfer' && chosen > 0
                ? `Make ${chosen} transfer${chosen === 1 ? '' : 's'}`
                : HEADLINE[plan.recommendation]}
            </p>
            <CardDescription className="max-w-2xl leading-relaxed">{plan.reason}</CardDescription>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
            <Badge variant="secondary" className="tabular-nums">
              {plan.freeTransfers} free transfer{plan.freeTransfers === 1 ? '' : 's'}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {plan.freeTransfersNext} next week if you follow this
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.moves.length > 0 && (
          <div className="space-y-2">
            {plan.moves.map((move) => (
              <Card key={`${move.out.id}-${move.in.id}`} size="sm" className="flex-row flex-wrap items-center gap-3 bg-muted/20 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <PosBadge pos={move.out.pos} />
                  <span className="truncate text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/50">
                    {move.out.name}
                  </span>
                  <StatusDot status={move.out.status} chanceNext={move.out.chanceNext} />
                  <span className="text-xs text-muted-foreground">sell £{move.outSellingPrice.toFixed(1)}m</span>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" aria-label="replaced by" />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-primary">{move.in.name}</span>
                  <span className="text-xs text-muted-foreground">{move.in.teamName} · £{move.in.price.toFixed(1)}m</span>
                  <StatusDot status={move.in.status} chanceNext={move.in.chanceNext} />
                </div>
                <div className="ml-auto flex items-center gap-4">
                  <div className="text-right">
                    <XpBreakdown player={move.in} />
                    <div className="text-[10px] text-muted-foreground">next GW (vs {(move.out.projByGw[0] ?? 0).toFixed(1)})</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-primary tabular-nums">{signed(move.gain)}</div>
                    <div className="text-[10px] text-muted-foreground">pts / 5 GWs</div>
                  </div>
                  {move.tookHit && <Badge variant="destructive" className="text-[10px]">−4 hit</Badge>}
                </div>
              </Card>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" className="gap-1.5" onClick={() => onApply(plan.moves)}>
                <Check className="size-3.5" />
                Apply to my draft
              </Button>
              <span className="text-xs text-muted-foreground">
                Updates your squad, bank and free transfers below so the XI and captain reflect the new team. Make the same moves on the FPL site.
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your options this week</p>
            <Label className="text-xs font-normal text-muted-foreground">
              <Checkbox checked={allowHits} onCheckedChange={(checked) => onAllowHitsChange(Boolean(checked))} />
              Consider −4 hits
            </Label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {plan.options.map((option) => {
              const isChosen = option.transfers === chosen;
              return (
                <Card
                  key={option.transfers}
                  size="sm"
                  className={`gap-1 p-3 ${isChosen ? 'bg-primary/10 ring-primary/50' : 'bg-muted/20'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{optionLabel(option.transfers)}</span>
                    {isChosen && <Badge className="text-[10px]">Best</Badge>}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {option.transfers === 0 ? 'Bank the transfer' : `${signed(option.gain)} pts over 5 GWs`}
                    {option.hits > 0 && <span className="text-destructive"> · −{option.hits * 4} hit</span>}
                  </div>
                  {option.moves.length > 0 && (
                    <div className="truncate text-[11px] text-muted-foreground" title={option.moves.map((m) => `${m.out.name} → ${m.in.name}`).join(', ')}>
                      {option.moves.map((m) => m.in.name).join(', ')}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            “Best” weighs the projected gain against the value of saving free transfers and any hit cost. Projected gains are discounted because the top-rated move is usually a little optimistic — more so early in the season.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
