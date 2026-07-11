import { useEffect, useMemo, useState } from 'react';
import { ChevronsUpDown, RotateCcw } from 'lucide-react';
import type { ChipKey, Player, TeamResponse } from '@/api/index.ts';
import { useAppStore } from '@/store/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import { PosBadge } from '@/components/PosBadge.tsx';

const CHIP_LABELS: Record<ChipKey, string> = {
  wildcard: 'Wildcard',
  freeHit: 'Free Hit',
  benchBoost: 'Bench Boost',
  tripleCaptain: 'Triple Captain',
};

interface DeadlineSetupProps {
  team: TeamResponse;
  allPlayers: Player[];
}

export function DeadlineSetup({ team, allPlayers }: DeadlineSetupProps) {
  const [selectedOutId, setSelectedOutId] = useState<number | null>(null);
  const {
    bank,
    setBank,
    freeTransfers,
    setFreeTransfers,
    chipAvailability,
    setChipAvailable,
    draftSquadIds,
    sellingPrices,
    hydrateDeadlineDraft,
    replaceDraftPlayer,
    resetDeadlineDraft,
  } = useAppStore();

  useEffect(() => {
    hydrateDeadlineDraft(team);
  }, [hydrateDeadlineDraft, team]);

  const playerMap = useMemo(
    () => new Map(allPlayers.map((player) => [player.id, player])),
    [allPlayers]
  );
  const draftPlayers = draftSquadIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  const ownedIds = new Set(draftSquadIds);
  const currentBank = bank ?? team.bank;
  const selectedOut = selectedOutId == null ? null : playerMap.get(selectedOutId) ?? null;

  function candidatesFor(outPlayer: Player) {
    const clubCounts = draftPlayers.reduce<Record<number, number>>((counts, player) => {
      counts[player.team] = (counts[player.team] ?? 0) + 1;
      return counts;
    }, {});
    const funds = currentBank + (sellingPrices[outPlayer.id] ?? outPlayer.price);

    return allPlayers
      .filter((candidate) => {
        if (candidate.pos !== outPlayer.pos || ownedIds.has(candidate.id)) return false;
        const countAfterSale = (clubCounts[candidate.team] ?? 0) -
          (candidate.team === outPlayer.team ? 1 : 0);
        return countAfterSale < 3 && candidate.price <= funds + 0.001;
      })
      .sort((a, b) => b.projHorizon - a.projHorizon);
  }

  function handleReplacement(outPlayer: Player, nextId: number) {
    const incoming = playerMap.get(nextId);
    if (!incoming) return;
    const salePrice = sellingPrices[outPlayer.id] ?? outPlayer.price;
    setBank(Number((currentBank + salePrice - incoming.price).toFixed(1)));
    replaceDraftPlayer(outPlayer.id, incoming.id, incoming.price);
    setSelectedOutId(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Deadline setup
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Seeded from your last published team. Correct this local draft to match any private moves.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              resetDeadlineDraft(team);
              setSelectedOutId(null);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to published
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="deadline-bank" className="text-xs text-muted-foreground">Exact bank (£m)</Label>
            <Input
              id="deadline-bank"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={currentBank}
              onChange={(event) => setBank(Math.max(0, Number(event.target.value) || 0))}
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="free-transfers" className="text-xs text-muted-foreground">Free transfers available</Label>
            <Input
              id="free-transfers"
              type="number"
              min={0}
              max={5}
              step={1}
              value={freeTransfers}
              onChange={(event) => setFreeTransfers(Math.max(0, Math.min(5, Number(event.target.value) || 0)))}
              className="h-9"
            />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs text-muted-foreground">Available chips</Label>
            <Card size="sm" className="grid grid-cols-2 gap-x-3 gap-y-2 p-3">
              {(Object.keys(CHIP_LABELS) as ChipKey[]).map((chip) => (
                <Label key={chip} className="text-xs font-normal">
                  <Checkbox
                    checked={chipAvailability[chip]}
                    onCheckedChange={(checked) => setChipAvailable(chip, checked)}
                  />
                  {CHIP_LABELS[chip]}
                </Label>
              ))}
            </Card>
          </div>
        </div>

        <Collapsible className="rounded-lg border bg-muted/20">
          <CollapsibleTrigger
            render={
              <Button variant="ghost" className="h-auto w-full justify-between rounded-b-none px-4 py-3" />
            }
          >
            Edit current deadline squad ({draftPlayers.length}/15)
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t p-3">
            <p className="mb-3 text-xs text-muted-foreground">
              Replacements are limited to legal, affordable players in the same position. Changes stay in this browser only.
            </p>
            {selectedOut && (
              <Card size="sm" className="mb-3 flex-row flex-wrap items-center gap-2 bg-primary/5 p-3 ring-primary/30">
                <span className="text-xs text-muted-foreground">Replace</span>
                <PosBadge pos={selectedOut.pos} />
                <span className="text-sm font-semibold">{selectedOut.name}</span>
                <span className="text-xs text-muted-foreground">with</span>
                <Select
                  value=""
                  onValueChange={(value) => handleReplacement(selectedOut, Number(value))}
                >
                  <SelectTrigger aria-label={`Replacement for ${selectedOut.name}`} className="min-w-64">
                    <SelectValue placeholder="Choose replacement…" />
                  </SelectTrigger>
                  <SelectContent>
                  {candidatesFor(selectedOut).map((candidate) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {candidate.name} · £{candidate.price.toFixed(1)}m · {candidate.projHorizon.toFixed(1)} xP
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedOutId(null)}>
                  Cancel
                </Button>
              </Card>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {draftPlayers.map((player) => (
                <Card key={player.id} size="sm" className="flex-row items-center gap-2 px-3 py-2">
                  <PosBadge pos={player.pos} />
                  <span className="min-w-24 flex-1 truncate text-sm font-medium">{player.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    sell £{(sellingPrices[player.id] ?? player.price).toFixed(1)}m
                  </span>
                  <Button
                    variant={selectedOutId === player.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setSelectedOutId(player.id)}
                  >
                    Replace
                  </Button>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
