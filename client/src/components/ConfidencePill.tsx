import { Badge } from '@/components/ui/badge.tsx';

interface Props { confidence: 'high' | 'medium' | 'low'; }

const styles: Record<string, string> = {
  high:   'border-primary/40 bg-primary/15 text-primary',
  medium: 'border-border bg-secondary text-secondary-foreground',
  low:    'border-border bg-muted text-muted-foreground',
};

export function ConfidencePill({ confidence }: Props) {
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${styles[confidence]}`}>
      {confidence.toUpperCase()}
    </Badge>
  );
}
