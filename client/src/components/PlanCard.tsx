import { ArrowRight, Check } from 'lucide-react';
import type { TransferMove, TransferPlan } from '@/api/index.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { XpBreakdown } from '@/components/XpBreakdown.tsx';
import { availability, signed } from '@/lib/format.ts';

interface Props {
  gw: number;
  plan: TransferPlan;
  allowHits: boolean;
  onAllowHitsChange: (allow: boolean) => void;
  onApply: (moves: TransferMove[]) => void;
}

function headline(plan: TransferPlan): string {
  const n = plan.moves.length;
  if (n === 0) return 'Roll your transfer';
  if (plan.hitsTaken > 0) return `Make ${n} transfers (−${plan.hitsTaken * 4} hit)`;
  return `Make ${n} transfer${n === 1 ? '' : 's'}`;
}

export function PlanCard({ gw, plan, allowHits, onAllowHitsChange, onApply }: Props) {
  const chosen = plan.moves.length;
  return (
    <Card>
      <CardHeader>
        <CardDescription>GW{gw} transfers</CardDescription>
        <CardTitle className="text-xl">{headline(plan)}</CardTitle>
        <CardDescription>{plan.reason}</CardDescription>
        <CardAction className="flex flex-col items-end gap-1">
          <Badge variant="secondary">{plan.freeTransfers} free transfer{plan.freeTransfers === 1 ? '' : 's'}</Badge>
          <span className="text-xs text-muted-foreground">{plan.freeTransfersNext} next week</span>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {plan.moves.length > 0 && (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sell</TableHead>
                  <TableHead />
                  <TableHead>Buy</TableHead>
                  <TableHead className="text-right">Next GW</TableHead>
                  <TableHead className="text-right">Gain, 5 GWs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.moves.map((move) => {
                  const outFlag = availability(move.out);
                  return (
                    <TableRow key={`${move.out.id}-${move.in.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{move.out.pos}</Badge>
                          <span className="text-muted-foreground line-through">{move.out.name}</span>
                          {outFlag && <Badge variant={outFlag.variant}>{outFlag.label}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">sells for £{move.outSellingPrice.toFixed(1)}m</div>
                      </TableCell>
                      <TableCell><ArrowRight className="size-4 text-muted-foreground" aria-label="replaced by" /></TableCell>
                      <TableCell>
                        <div className="font-medium">{move.in.name}</div>
                        <div className="text-xs text-muted-foreground">{move.in.teamName} · £{move.in.price.toFixed(1)}m</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <XpBreakdown player={move.in} />
                        <div className="text-xs text-muted-foreground">was {(move.out.projByGw[0] ?? 0).toFixed(1)}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {signed(move.gain)}
                        {move.tookHit && <Badge variant="destructive" className="ml-2">−4</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => onApply(plan.moves)}>
                <Check data-icon="inline-start" />
                Apply to my draft
              </Button>
              <span className="text-xs text-muted-foreground">
                Updates the squad, bank and free transfers below. Make the same moves on the FPL site.
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium">Your options this week</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead className="text-right">Gain, 5 GWs</TableHead>
                <TableHead className="text-right">Hit</TableHead>
                <TableHead>Players in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.options.map((option) => (
                <TableRow key={option.transfers} data-state={option.transfers === chosen ? 'selected' : undefined}>
                  <TableCell className="font-medium">
                    {option.transfers === 0 ? 'Roll' : `${option.transfers} transfer${option.transfers === 1 ? '' : 's'}`}
                    {option.transfers === chosen && <Badge className="ml-2">Best</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{option.transfers === 0 ? '—' : signed(option.gain)}</TableCell>
                  <TableCell className="text-right tabular-nums">{option.hits > 0 ? `−${option.hits * 4}` : '—'}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {option.moves.map((m) => m.in.name).join(', ') || 'Bank the transfer'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
        <div className="flex items-center gap-2">
          <Switch id="allow-hits" checked={allowHits} onCheckedChange={(checked) => onAllowHitsChange(checked)} />
          <Label htmlFor="allow-hits">Consider −4 hits</Label>
        </div>
        <span className="text-xs text-muted-foreground">
          “Best” weighs projected gain against the value of saving transfers and any hit. Gains are discounted, more so early in the season.
        </span>
      </CardFooter>
    </Card>
  );
}
