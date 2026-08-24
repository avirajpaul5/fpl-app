import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { useAppStore } from '@/store/index.ts';

export function TeamIdInput() {
  const { teamId, setTeamId } = useAppStore();
  const [value, setValue] = useState(teamId ? String(teamId) : '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseInt(value);
    if (!isNaN(id) && id > 0) setTeamId(id);
  }

  return (
    <div className="space-y-1">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Label htmlFor="team-id" className="shrink-0 text-muted-foreground">Team ID</Label>
        <Input
          id="team-id"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your FPL team ID"
          className="w-40 h-8 text-sm"
        />
        <Button type="submit" size="sm" className="h-8">Load</Button>
        {teamId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => {
              setTeamId(null);
              setValue('');
            }}
          >
            Clear
          </Button>
        )}
      </form>
      {teamId && (
        <p className="pl-14 text-[10px] text-muted-foreground">Saved in this browser for future sessions.</p>
      )}
    </div>
  );
}
