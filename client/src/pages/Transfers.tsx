import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPlayers, type Player } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table.tsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { PosBadge } from '@/components/PosBadge.tsx';
import { StatusDot } from '@/components/StatusDot.tsx';

type SortKey = 'epNext' | 'projHorizon' | 'price' | 'ownership' | 'ppg' | 'totalPoints';
type SortDir = 'asc' | 'desc';
type PosFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';

interface CompareSlot { player: Player; role: 'out' | 'in'; }

const SORT_LABELS: Record<SortKey, string> = {
  epNext:       'xP',
  projHorizon:  '5-GW',
  price:        '£',
  ownership:    'Own%',
  ppg:          'PPG',
  totalPoints:  'Pts',
};

export function Transfers() {
  const [pos, setPos]             = useState<PosFilter>('ALL');
  const [maxPrice, setMaxPrice]   = useState('');
  const [sort, setSort]           = useState<SortKey>('epNext');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');
  const [search, setSearch]       = useState('');
  const [compare, setCompare]     = useState<CompareSlot[]>([]);
  const [diffOnly, setDiffOnly]   = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['players', pos, maxPrice, sort],
    queryFn: () => fetchPlayers({
      pos: pos === 'ALL' ? undefined : pos,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      sort,
    }),
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let r = data.players;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((p) => p.name.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q));
    }
    if (diffOnly) r = r.filter((p) => p.ownership < 15 && p.epNext > 4);
    r = [...r].sort((a, b) => {
      const diff = (a[sort] as number) - (b[sort] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
    return r;
  }, [data, search, diffOnly, sort, sortDir]);

  function handleSort(key: SortKey) {
    if (sort === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(key);
      setSortDir('desc');
    }
  }

  function setRole(player: Player, role: 'out' | 'in') {
    setCompare((prev) => [...prev.filter((c) => c.role !== role), { player, role }]);
  }

  const outP = compare.find((c) => c.role === 'out')?.player;
  const inP  = compare.find((c) => c.role === 'in')?.player;

  const recencyWarn = inP && outP &&
    inP.projHorizon < outP.projHorizon &&
    inP.epNext > outP.epNext;

  function SortIcon({ col }: { col: SortKey }) {
    if (sort !== col) return <span className="ml-1 text-muted-foreground">↕</span>;
    return <span className="ml-1 text-foreground">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  function SortHead({ col, className }: { col: SortKey; className?: string }) {
    return (
      <TableHead className={className}>
        <Button variant="ghost" size="sm" onClick={() => handleSort(col)} className="-mx-2">
          {SORT_LABELS[col]}<SortIcon col={col} />
        </Button>
      </TableHead>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Transfer Planner</h1>

      {/* Compare tray */}
      {(outP || inP) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Compare
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCompare([])}>
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {recencyWarn && (
              <Alert>
                <AlertTitle>Recency-chasing warning</AlertTitle>
                <AlertDescription>The player you're transferring in has a higher next-GW projection but a lower 5-GW horizon than the player you're selling.</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-6">
              {([ { role: 'out' as const, label: 'OUT', player: outP, accent: 'text-muted-foreground' },
                  { role: 'in'  as const, label: 'IN',  player: inP,  accent: 'text-primary' } ]
              ).map(({ role, label, player, accent }) => (
                <div key={role}>
                  <p className={`text-xs font-semibold ${accent} mb-2`}>{label}</p>
                  {player ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PosBadge pos={player.pos} />
                        <span className="font-semibold text-sm">{player.name}</span>
                        <StatusDot status={player.status} chanceNext={player.chanceNext} />
                        <span className="text-xs text-muted-foreground">{player.teamName} · £{player.price.toFixed(1)}m</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Next GW xP',   value: player.epNext.toFixed(1),     hi: true },
                          { label: '5-GW horizon',  value: player.projHorizon.toFixed(1), hi: true },
                          { label: 'PPG',           value: player.ppg.toFixed(1),         hi: false },
                          { label: 'Owned by',      value: `${player.ownership.toFixed(1)}%`, hi: false },
                        ].map(({ label: l, value: v, hi }) => (
                          <Card key={l} size="sm" className="gap-0 bg-muted/40 p-2.5">
                            <p className="text-[10px] text-muted-foreground">{l}</p>
                            <p className={`font-semibold text-sm tabular-nums ${hi ? 'text-primary' : ''}`}>{v}</p>
                          </Card>
                        ))}
                      </div>
                      {/* GW-by-GW projection */}
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">GW-by-GW projection</p>
                        <div className="flex gap-1">
                          {player.projByGw.map((xp, k) => (
                            <div key={k} className="flex-1 text-center">
                              <p className="text-[10px] text-muted-foreground/60">+{k}</p>
                              <Badge variant={xp > 5 ? 'default' : 'secondary'} className="w-full tabular-nums">
                                {xp.toFixed(1)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Select a player below</p>
                  )}
                </div>
              ))}
            </div>

            {outP && inP && (
              <>
                <Separator />
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">5-GW gain: </span>
                    <span className={`font-semibold tabular-nums ${inP.projHorizon - outP.projHorizon > 0 ? 'text-primary' : 'text-destructive'}`}>
                      {(inP.projHorizon - outP.projHorizon > 0 ? '+' : '')}{(inP.projHorizon - outP.projHorizon).toFixed(1)} xP
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price diff: </span>
                    <span className="font-semibold tabular-nums">
                      {(inP.price - outP.price > 0 ? '+' : '')}{(inP.price - outP.price).toFixed(1)}m
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card size="sm" className="flex-row flex-wrap items-center gap-2 p-3">
        <div className="flex gap-1">
          {(['ALL','GK','DEF','MID','FWD'] as PosFilter[]).map((p) => (
            <Button
              key={p}
              variant={pos === p ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => setPos(p)}
            >
              {p}
            </Button>
          ))}
        </div>
        <Input
          type="number"
          placeholder="Max £m"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="h-8 w-28 text-sm"
        />
        <Input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />
        <Label className="h-8 rounded-lg border border-border bg-background px-2.5 font-normal">
          <Checkbox checked={diffOnly} onCheckedChange={setDiffOnly} />
          Differentials
        </Label>
        <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); setSortDir('desc'); }}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Sort by…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="epNext">Next GW xP</SelectItem>
            <SelectItem value="projHorizon">5-GW horizon</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="ownership">Ownership</SelectItem>
            <SelectItem value="ppg">PPG</SelectItem>
            <SelectItem value="totalPoints">Total Points</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          title="Toggle sort direction"
        >
          {sortDir === 'desc' ? '↓ Desc' : '↑ Asc'}
        </Button>
      </Card>

      {isLoading && <Card><CardContent className="space-y-3 py-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></CardContent></Card>}
      {isError && <Alert variant="destructive"><AlertTitle>Could not load players</AlertTitle><AlertDescription>{String(error)}</AlertDescription></Alert>}

      {/* Player table */}
      {filtered.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Team</TableHead>
                <SortHead col="price" className="text-right" />
                <SortHead col="epNext" className="text-right" />
                <SortHead col="projHorizon" className="text-right" />
                <SortHead col="ppg" className="text-right" />
                <SortHead col="ownership" className="text-right" />
                <SortHead col="totalPoints" className="text-right" />
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map((p) => {
                const isDiff = p.ownership < 15 && p.epNext > 4;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PosBadge pos={p.pos} />
                        <span className="font-medium text-sm">{p.name}</span>
                        {isDiff && (
                          <Badge variant="outline" className="text-[10px]">Differential</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.teamName}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">£{p.price.toFixed(1)}m</TableCell>
                    <TableCell className="text-right">
                      <span className="text-primary font-semibold text-sm tabular-nums">{p.epNext.toFixed(1)}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{p.projHorizon.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm tabular-nums">{p.ppg.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm tabular-nums">{p.ownership.toFixed(1)}%</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm tabular-nums">{p.totalPoints}</TableCell>
                    <TableCell className="text-right">
                      <StatusDot status={p.status} chanceNext={p.chanceNext} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="outline"
                          className="text-muted-foreground"
                          onClick={() => setRole(p, 'out')}>OUT</Button>
                        <Button size="xs" variant="secondary"
                          onClick={() => setRole(p, 'in')}>IN</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > 100 && (
            <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
              Showing 100 of {filtered.length} — use filters to narrow down.
            </div>
          )}
        </Card>
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <Alert><AlertTitle>No players match</AlertTitle><AlertDescription>Try clearing a filter or increasing the maximum price.</AlertDescription></Alert>
      )}
    </div>
  );
}
