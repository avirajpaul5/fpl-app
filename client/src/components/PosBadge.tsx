import { Badge } from '@/components/ui/badge.tsx';

interface Props { pos: 'GK' | 'DEF' | 'MID' | 'FWD'; }

export function PosBadge({ pos }: Props) {
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold">
      {pos}
    </Badge>
  );
}
