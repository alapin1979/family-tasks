import { useState } from 'react';
import { AppProvider, getFamilyLogin, getFamilyToken, clearFamilySession } from './context';
import HomeScreen from './components/HomeScreen';
import ParentDashboard from './components/ParentDashboard';
import ChildDashboard from './components/ChildDashboard';
import FamilyLogin from './components/FamilyLogin';
import type { ActiveView } from './types';

function AppInner({ familyLogin, onSwitchFamily, onLoginChanged }: { familyLogin: string; onSwitchFamily: () => void; onLoginChanged: (login: string) => void }) {
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
  return <HomeScreen onSelect={handleSelect} familyLogin={familyLogin} onSwitchFamily={onSwitchFamily} onLoginChanged={onLoginChanged} />;
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!getFamilyToken());
  const [familyLogin, setFamilyLogin] = useState<string>(() => getFamilyLogin() ?? '');

  function handleAuthed() {
    setFamilyLogin(getFamilyLogin() ?? '');
    setAuthed(true);
  }

  function handleSwitchFamily() {
    clearFamilySession();
    setAuthed(false);
  }

  if (!authed) {
    return <FamilyLogin onAuthed={handleAuthed} />;
  }

  return (
    <AppProvider onAuthError={handleSwitchFamily}>
      <AppInner familyLogin={familyLogin} onSwitchFamily={handleSwitchFamily} onLoginChanged={setFamilyLogin} />
    </AppProvider>
  );
}
