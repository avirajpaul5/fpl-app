import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Transfers } from './pages/Transfers.tsx';
import { Chips } from './pages/Chips.tsx';
import { SquadBuilder } from './pages/SquadBuilder.tsx';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pb-12">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/chips" element={<Chips />} />
          <Route path="/squad" element={<SquadBuilder />} />
        </Routes>
      </main>
    </div>
  );
}
