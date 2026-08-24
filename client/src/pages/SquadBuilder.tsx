import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchOptimize, type Player } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Card, CardContent } from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table.tsx';
import { StatusDot } from '@/components/StatusDot.tsx';
import { PosBadge } from '@/components/PosBadge.tsx';
import { useAppStore } from '@/store/index.ts';
import { SquadBuilderSkeleton } from '@/components/LoadingSkeletons.tsx';

type Pos = 'GK' | 'DEF' | 'MID' | 'FWD';

function groupByPos(players: Player[]) {
  return {
    GK:  players.filter((p) => p.pos === 'GK'),
    DEF: players.filter((p) => p.pos === 'DEF'),
    MID: players.filter((p) => p.pos === 'MID'),
    FWD: players.filter((p) => p.pos === 'FWD'),
  };
}

const POS_LABEL: Record<Pos, string> = {
  GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards',
};

function SquadSection({ pos, players }: { pos: Pos; players: Player[] }) {
  if (players.length === 0) return null;
  const sorted = [...players].sort((a, b) => (b.projHorizon ?? 0) - (a.projHorizon ?? 0));
  return (
    <div>
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {POS_LABEL[pos]}
        </span>
        <span className="text-xs text-muted-foreground">({players.length})</span>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="hidden sm:table-cell">Team</TableHead>
              <TableHead className="hidden sm:table-cell">Fixtures</TableHead>
              <TableHead className="text-right">5-GW xP</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">xP/£</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <PosBadge pos={p.pos} />
                    <span className="font-medium text-sm">{p.name}</span>
                    <StatusDot status={p.status} chanceNext={p.chanceNext} />
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {p.teamName}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex gap-0.5">
                    {p.upcoming.slice(0, 5).map((f, k) => (
                      <div
                        key={k}
                        title={`GW${f.gw} FDR${f.fdr}${f.isDGW ? ' DGW' : ''}${f.isHome ? ' H' : ' A'}`}
                        className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center fdr-${f.fdr}`}
                      >
                        {f.fdr}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-primary font-semibold text-sm tabular-nums">
                    {(p.projHorizon ?? 0).toFixed(1)}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  £{p.price.toFixed(1)}m
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                  {((p.projHorizon ?? 0) / p.price).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export function SquadBuilder() {
  const { setDraftSquadIds } = useAppStore();
  const [budget, setBudget] = useState('100');

  const optimize = useMutation({
    mutationFn: () => fetchOptimize({ budget: parseFloat(budget) || 100 }),
    onSuccess: (data) => setDraftSquadIds(data.squad.players.map((p) => p.id)),
  });

  const squad       = optimize.data?.squad.players ?? [];
  const grouped     = groupByPos(squad);
  const totalHorizon = squad.reduce((s, p) => s + (p.projHorizon ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Squad Builder</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Optimal 15 by projected 5-GW xP per £m. The app advises — you act in the official FPL app.
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="squad-budget" className="text-xs text-muted-foreground">Budget (£m)</Label>
              <Input
                id="squad-budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min={50} max={110} step={0.5}
                className="w-28 h-9 text-sm"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => optimize.mutate()}
              disabled={optimize.isPending}
              className="h-9 mt-5"
            >
              {optimize.isPending ? 'Optimising…' : 'Build Optimal Squad'}
            </Button>
          </div>

          {squad.length > 0 && (
            <>
              <Separator />
              <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-8">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Spent</p>
                  <p className="font-semibold tabular-nums text-sm">£{optimize.data?.totalCost.toFixed(1)}m</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Bank</p>
                  <p className="font-semibold tabular-nums text-sm text-primary">£{optimize.data?.bank.toFixed(1)}m</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">5-GW xP</p>
                  <p className="font-semibold tabular-nums text-sm">{totalHorizon.toFixed(1)}</p>
                </div>
              </div>
            </>
          )}

          {optimize.isError && (
            <Alert variant="destructive"><AlertTitle>Could not build squad</AlertTitle><AlertDescription>{optimize.error?.message}</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <Alert><AlertDescription>This app does <strong>not</strong> write to FPL. Use this squad as a reference and make changes manually.</AlertDescription></Alert>

      {/* Squad by position */}
      {optimize.isPending && <SquadBuilderSkeleton />}
      {squad.length > 0 && (
        <div className={`space-y-6 ${optimize.isPending ? 'hidden' : ''}`}>
          {(['GK', 'DEF', 'MID', 'FWD'] as Pos[]).map((pos) => (
            <SquadSection key={pos} pos={pos} players={grouped[pos]} />
          ))}
        </div>
      )}
    </div>
  );
}
