import { useState } from 'react';
import { AppProvider } from './context';
import HomeScreen from './components/HomeScreen';
import ParentDashboard from './components/ParentDashboard';
import ChildDashboard from './components/ChildDashboard';
import type { ActiveView } from './types';

function AppInner() {
  const [view, setView] = useState<ActiveView>('home');
  const [activeChildId, setActiveChildId] = useState<string | undefined>();

  function handleSelect(v: ActiveView, childId?: string) {
    setView(v);
    setActiveChildId(childId);
  }

  function handleLogout() {
    setView('home');
    setActiveChildId(undefined);
  }

  if (view === 'parent') return <ParentDashboard onLogout={handleLogout} />;
  if (view === 'child' && activeChildId) return <ChildDashboard childId={activeChildId} onLogout={handleLogout} />;
  return <HomeScreen onSelect={handleSelect} />;
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
