import { Progress, ProgressValue } from '@/components/ui/progress.tsx';

interface Props {
  value: number;
  max?: number;
}

export function XpBar({ value, max = 12 }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <Progress value={pct} className="flex-nowrap items-center gap-2">
      <ProgressValue className="w-8 text-right text-xs">
        {() => value.toFixed(1)}
      </ProgressValue>
    </Progress>
  );
}
