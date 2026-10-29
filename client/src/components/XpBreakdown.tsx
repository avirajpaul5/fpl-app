import type { Player } from '@/api/index.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx';
import { breakdownRows, signed } from '@/lib/format.ts';

interface Props {
  player: Player;
  /** Projection to display (defaults to next GW). */
  value?: number;
  className?: string;
}

/** Next-GW expected points with a hover breakdown of where they come from. */
export function XpBreakdown({ player, value, className }: Props) {
  const xp = value ?? player.projByGw[0] ?? 0;
  const rows = breakdownRows(player.breakdown);
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${player.name}: ${xp.toFixed(1)} expected points`}
        closeOnClick={false}
        className={className ?? 'cursor-help text-xs font-semibold text-primary tabular-nums underline decoration-dotted decoration-primary/40 underline-offset-2'}
      >
        {xp.toFixed(1)}
      </TooltipTrigger>
      <TooltipContent side="left" align="center">
        <p className="mb-1 font-semibold">{player.name} · next GW</p>
        {player.xMins != null && (
          <p className="mb-1 text-muted-foreground">
            ~{Math.round(player.xMins)} expected minutes (accounts for rotation and injury risk)
          </p>
        )}
        {rows.length > 0 ? (
          <table className="w-full tabular-nums">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="pr-3">{row.label}</td>
                  <td className="text-right">{signed(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No projection available.</p>
        )}
        {player.news && <p className="mt-1 text-amber-500">{player.news}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
