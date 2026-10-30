import { describe, expect, it } from 'vitest';
import { upcomingEvent, type RawBootstrap } from './fplClient.js';

const event = (id: number, deadline: string, flags: { is_next?: boolean; is_current?: boolean } = {}) => ({
  id, name: `Gameweek ${id}`, deadline_time: deadline, finished: false, is_current: false, is_next: false, ...flags,
});

describe('upcomingEvent', () => {
  it('plans for the first gameweek whose deadline is still ahead, even if FPL flags lag', () => {
    const bootstrap = {
      events: [
        event(8, '2026-10-23T17:30:00Z', { is_current: true }),
        // FPL still flags GW9 as next for a few minutes after its deadline passes.
        event(9, '2026-10-31T11:00:00Z', { is_next: true }),
        event(10, '2026-11-06T18:30:00Z'),
      ],
    } as unknown as RawBootstrap;
    expect(upcomingEvent(bootstrap, Date.parse('2026-10-31T10:59:00Z'))?.id).toBe(9);
    expect(upcomingEvent(bootstrap, Date.parse('2026-10-31T11:00:01Z'))?.id).toBe(10);
  });
});
