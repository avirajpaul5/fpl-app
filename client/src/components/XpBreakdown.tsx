import type { Player } from '@/api/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx';
import { breakdownRows, signed } from '@/lib/format.ts';

interface Props {
  player: Player;
  /** Projection to display (defaults to next GW). */
  value?: number;
  className?: string;
}

/** Next-GW expected points; hover for where they come from. */
export function XpBreakdown({ player, value, className }: Props) {
  const xp = value ?? player.projByGw[0] ?? 0;
  const rows = breakdownRows(player.breakdown);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="link" size="xs" className={className ?? 'px-0 tabular-nums'} />}
        aria-label={`${player.name}: ${xp.toFixed(1)} expected points`}
      >
        {xp.toFixed(1)}
      </TooltipTrigger>
      <TooltipContent side="left" className="flex-col items-stretch gap-1">
        <div className="font-medium">{player.name} · next GW</div>
        {player.xMins != null && <div>~{Math.round(player.xMins)} expected minutes</div>}
        <Separator className="my-1 bg-background/20" />
        {rows.length > 0 ? rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 tabular-nums">
            <span>{row.label}</span>
            <span>{signed(row.value)}</span>
          </div>
        )) : <div>No projection available.</div>}
        {player.news && (
          <>
            <Separator className="my-1 bg-background/20" />
            <div>{player.news}</div>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
