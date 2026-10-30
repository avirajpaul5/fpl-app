import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { useRememberedTeam } from './hooks/use-remembered-team.ts';

// Only the dashboard loads up front; other pages (and the chart library) load on visit.
const TrackRecord = lazy(() => import('./pages/TrackRecord.tsx').then((m) => ({ default: m.TrackRecord })));
const Transfers = lazy(() => import('./pages/Transfers.tsx').then((m) => ({ default: m.Transfers })));
const Chips = lazy(() => import('./pages/Chips.tsx').then((m) => ({ default: m.Chips })));
const SquadBuilder = lazy(() => import('./pages/SquadBuilder.tsx').then((m) => ({ default: m.SquadBuilder })));

export default function App() {
  useRememberedTeam();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pb-12">
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/track" element={<TrackRecord />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/chips" element={<Chips />} />
            <Route path="/squad" element={<SquadBuilder />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
