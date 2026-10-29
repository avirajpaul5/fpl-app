import type { PointsBreakdown } from '@/api/index.ts';

export function signed(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

/** Deadline in the viewer's own timezone, e.g. "Sat 31 Oct, 16:30 IST". */
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function timeUntil(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'deadline passed';
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `in ${days}d ${hours % 24}h`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `in ${hours}h ${minutes}m`;
}

const BREAKDOWN_LABELS: Record<keyof PointsBreakdown, string> = {
  appearance: 'Playing time',
  goals: 'Goals',
  assists: 'Assists',
  cleanSheet: 'Clean sheet',
  goalsConceded: 'Goals conceded',
  saves: 'Saves',
  bonus: 'Bonus',
  defcon: 'Defensive contribution',
  cards: 'Cards',
};

/** Breakdown components worth showing, largest first. */
export function breakdownRows(b: PointsBreakdown | undefined): Array<{ label: string; value: number }> {
  if (!b) return [];
  return (Object.keys(BREAKDOWN_LABELS) as Array<keyof PointsBreakdown>)
    .map((key) => ({ label: BREAKDOWN_LABELS[key], value: b[key] }))
    .filter((row) => Math.abs(row.value) >= 0.05)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}
