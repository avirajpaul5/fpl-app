import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Transfers } from './pages/Transfers.tsx';
import { Chips } from './pages/Chips.tsx';
import { SquadBuilder } from './pages/SquadBuilder.tsx';

// Charts are only needed on the track record page; keep them out of the main bundle.
const TrackRecord = lazy(() => import('./pages/TrackRecord.tsx').then((m) => ({ default: m.TrackRecord })));

export default function App() {
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
