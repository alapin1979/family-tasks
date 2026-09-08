import { useState } from 'react';
import { useApp } from '../context';
import OverviewTab from './parent/OverviewTab';
import ChildrenTab from './parent/ChildrenTab';
import TasksTab from './parent/TasksTab';
import RewardsTab from './parent/RewardsTab';
import SettingsTab from './parent/SettingsTab';
import ApprovalsTab from './parent/ApprovalsTab';

type Tab = 'overview' | 'children' | 'tasks' | 'approvals' | 'rewards' | 'settings';

interface Props {
  onLogout: () => void;
}

export default function ParentDashboard({ onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const { getPendingCompletions, getPendingTaskSuggestions } = useApp();
  const pendingCompletionsCount = getPendingCompletions().length;
  const pendingTaskSuggestionsCount = getPendingTaskSuggestions().length;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Обзор', icon: '📊' },
    { id: 'children', label: 'Дети', icon: '👨‍👩‍👧‍👦' },
    { id: 'tasks', label: 'Задания', icon: '✅' },
    { id: 'approvals', label: 'Проверка', icon: '🔍' },
    { id: 'rewards', label: 'Награды', icon: '🎁' },
    { id: 'settings', label: 'Настройки', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👨‍👩‍👧‍👦</span>
          <h1 className="font-bold text-gray-800 text-lg">Панель родителя</h1>
        </div>
        <button onClick={onLogout}
          className="text-gray-400 hover:text-gray-600 text-sm transition">
          Выйти
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 pb-24">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'children' && <ChildrenTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'approvals' && <ApprovalsTab />}
        {tab === 'rewards' && <RewardsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-3 text-xs transition relative ${
              tab === t.id ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`}>
            <span className="text-xl">{t.icon}</span>
            <span className="mt-0.5">{t.label}</span>
            {t.id === 'approvals' && pendingCompletionsCount > 0 && (
              <span className="absolute top-2 right-1/4 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {pendingCompletionsCount}
              </span>
            )}
            {t.id === 'tasks' && pendingTaskSuggestionsCount > 0 && (
              <span className="absolute top-2 right-1/4 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {pendingTaskSuggestionsCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
