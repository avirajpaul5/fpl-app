import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/index.ts';
import { fetchRememberedTeam, rememberTeam } from '@/api/index.ts';

function teamFromUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get('team'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Keeps the team ID across sessions and devices: a `?team=` link wins, then
 * this browser's saved ID, then the server's long-lived cookie (which
 * survives Safari clearing site storage after a week away).
 */
export function useRememberedTeam(): void {
  const { teamId, setTeamId } = useAppStore();
  const restored = useRef(false);

  useEffect(() => {
    const fromUrl = teamFromUrl();
    if (fromUrl) {
      setTeamId(fromUrl);
      restored.current = true;
      return;
    }
    if (useAppStore.getState().teamId != null) {
      restored.current = true;
      return;
    }
    fetchRememberedTeam()
      .then(({ teamId: remembered }) => {
        if (remembered && useAppStore.getState().teamId == null) setTeamId(remembered);
      })
      .catch(() => {})
      .finally(() => { restored.current = true; });
  }, [setTeamId]);

  useEffect(() => {
    if (!restored.current) return;
    rememberTeam(teamId).catch(() => {});
  }, [teamId]);
}
