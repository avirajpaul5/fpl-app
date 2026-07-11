import { Badge } from '@/components/ui/badge.tsx';

interface Props { status: string; chanceNext?: number | null; }

export function StatusDot({ status, chanceNext }: Props) {
  if (status === 'a') return null;

  const label =
    status === 'i' ? 'Injured'     :
    status === 's' ? 'Suspended'   :
    status === 'd' ? `Doubtful${chanceNext != null ? ` ${chanceNext}%` : ''}` :
    status === 'u' ? 'Unavailable' : status;

  return (
    <Badge title={label} variant="destructive" className="h-5 gap-1 px-1.5 text-[10px]">
      <span className="size-1.5 rounded-full bg-current" />
      {status === 'd' && chanceNext != null ? `${chanceNext}%` : label}
    </Badge>
  );
}
