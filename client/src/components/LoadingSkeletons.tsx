import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';

function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-live="polite">
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DeadlineSetupSkeleton() {
  return (
    <LoadingRegion label="Loading deadline setup">
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}

export function RecommendationSkeleton() {
  return (
    <LoadingRegion label="Loading personalized recommendations">
      <div className="space-y-5">
        <Card>
          <CardHeader><Skeleton className="h-4 w-28" /></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} size="sm" className="space-y-3 p-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-full" />
              </Card>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-4 w-28" /></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </LoadingRegion>
  );
}

export function PlayerTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading player table">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-5 gap-4 border-b border-border px-4 py-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        <div className="space-y-0">
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} className="grid grid-cols-5 gap-4 border-b border-border/70 px-4 py-3 last:border-0">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="ml-auto h-5 w-12" />
              <Skeleton className="ml-auto h-5 w-12" />
              <Skeleton className="ml-auto h-5 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </LoadingRegion>
  );
}

export function ChipGridSkeleton() {
  return (
    <LoadingRegion label="Loading chip strategy">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </CardContent>
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function SquadBuilderSkeleton() {
  return (
    <LoadingRegion label="Building optimized squad">
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, section) => (
          <div key={section} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Card className="space-y-2 p-4">
              {Array.from({ length: section === 0 ? 2 : section === 3 ? 3 : 5 }).map((_, row) => (
                <div key={row} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
