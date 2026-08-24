import { Badge } from '@/components/ui/badge.tsx';

interface Props { status: string; chanceNext?: number | null; }

export function StatusDot({ status, chanceNext }: Props) {
  if (status === 'a') return null;

  const isDoubtful = status === 'd';
  const label = status === 'i' ? 'Injured' :
    status === 's' ? 'Suspended' :
    isDoubtful ? `Doubtful${chanceNext != null ? ` · ${chanceNext}% chance` : ''}` :
    status === 'u' ? 'Unavailable' : status;

  return (
    <Badge
      title={label}
      aria-label={label}
      variant={isDoubtful ? 'outline' : 'destructive'}
      className={isDoubtful
        ? 'h-5 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-500'
        : 'h-5 gap-1 px-1.5 text-[10px]'}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {isDoubtful && chanceNext != null ? `${chanceNext}% chance` : label}
    </Badge>
  );
}
