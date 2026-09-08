import { useState } from 'react';
import { useApp } from '../context';
import type { CompletionStatus } from '../context';
import { isScheduledOn, todayStr } from '../utils';
import type { Task } from '../types';
import PointsHistory from './PointsHistory';

const AVATARS = ['👦', '👧', '🧒', '👶', '🐱', '🐶', '🦊', '🐸', '🐼', '🦄', '🐯', '🐻'];

interface Props {
  childId: string;
  onLogout: () => void;
}

export default function ChildDashboard({ childId, onLogout }: Props) {
  const { state, completeTask, uncompleteTask, getCompletionStatus, getChildBalance, getChildEarned, getChildSpent, getChildAutoPenalty, getChildManualPenalty, claimReward, suggestReward, suggestTask, editChild } = useApp();
  const [tab, setTab] = useState<'tasks' | 'rewards' | 'history' | 'profile'>('tasks');

  // Profile edit state
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestDesc, setSuggestDesc] = useState('');
  const [showSuggestTaskForm, setShowSuggestTaskForm] = useState(false);
  const [suggestTaskTitle, setSuggestTaskTitle] = useState('');
  const [suggestTaskDesc, setSuggestTaskDesc] = useState('');
  const [taskMsg, setTaskMsg] = useState<string | null>(null);

  const child = state.children.find(c => c.id === childId);
  const today = todayStr();

  if (!child) return null;

  const balance = getChildBalance(childId);
  const earned = getChildEarned(childId);
  const spent = getChildSpent(childId);
  const autoPenalty = getChildAutoPenalty(childId);
  const manualPenalty = getChildManualPenalty(childId);

  const todayTasks = state.tasks.filter(t => {
    if (t.pendingApproval) return false;
    if (!t.assignedTo.includes(childId)) return false;
    if (today < t.startDate || today > t.endDate) return false;
    if (t.recurrence === 'once' || t.reportAtEnd) {
      return getCompletionStatus(t, childId) !== 'approved';
    }
    return isScheduledOn(t, today);
  });

  const myTaskSuggestions = state.tasks.filter(t => t.pendingApproval && t.suggestedBy === childId);

  function handleSuggestTask() {
    if (!suggestTaskTitle.trim()) return;
    suggestTask(suggestTaskTitle.trim(), suggestTaskDesc.trim(), childId);
    setSuggestTaskTitle('');
    setSuggestTaskDesc('');
    setShowSuggestTaskForm(false);
    setTaskMsg('Предложение отправлено! Жди пока родитель его одобрит.');
    setTimeout(() => setTaskMsg(null), 3500);
  }

  const submittedCount = todayTasks.filter(t => {
    const s = getCompletionStatus(t, childId);
    return s === 'pending' || s === 'approved';
  }).length;
  const allDone = todayTasks.length > 0 && submittedCount === todayTasks.length;

  function handleToggle(task: Task) {
    const status = getCompletionStatus(task, childId);
    if (status === 'approved') return;
    if (status === 'none') {
      completeTask(task, childId);
    } else if (status === 'pending') {
      uncompleteTask(task, childId);
    } else {
      // denied — re-submit
      uncompleteTask(task, childId);
      completeTask(task, childId);
    }
  }

  function handleClaim(rewardId: string, cost: number) {
    if (balance < cost) {
      setClaimMsg('Недостаточно баллов!');
      setTimeout(() => setClaimMsg(null), 2500);
      return;
    }
    claimReward(rewardId, childId);
    setClaimMsg('Готово! Баллы списаны.');
    setTimeout(() => setClaimMsg(null), 3000);
  }

  const myApprovedClaims = state.rewardClaims.filter(c => c.childId === childId && c.approved);

  const mySuggestions = state.rewards.filter(r => r.suggestedBy === childId && r.pendingCost);
  const availableRewards = state.rewards.filter(r => !r.pendingCost);

  function handleSuggest() {
    if (!suggestTitle.trim()) return;
    suggestReward(suggestTitle.trim(), suggestDesc.trim(), childId);
    setSuggestTitle('');
    setSuggestDesc('');
    setShowSuggestForm(false);
    setClaimMsg('Предложение отправлено! Жди пока родитель установит цену.');
    setTimeout(() => setClaimMsg(null), 3500);
  }

  function openProfile() {
    setProfileName(child?.name ?? '');
    setProfileAvatar(child?.avatar ?? '');
    setProfileSaved(false);
    setTab('profile');
  }

  function saveProfile() {
    if (!profileName.trim() || !child) return;
    editChild(childId, { name: profileName.trim(), avatar: profileAvatar, pin: child.pin });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      {/* Header */}
      <div className="bg-white border-b border-orange-100 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button className="flex items-center gap-2 hover:opacity-80 transition" onClick={openProfile}>
            <span className="text-3xl">{child.avatar}</span>
            <div className="text-left">
              <div className="font-bold text-gray-800">{child.name}</div>
              <div className="text-xs text-gray-400">
                {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={`font-bold text-lg ${balance >= 0 ? 'text-orange-500' : 'text-red-500'}`}>
                {balance} ⭐
              </div>
              <div className="text-xs text-gray-400">баллов</div>
            </div>
            <button onClick={onLogout} className="text-gray-300 hover:text-gray-500 transition text-xl leading-none">✕</button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pb-24">
        {/* TASKS TAB */}
        {tab === 'tasks' && (
          <div>
            {allDone && (
              <div className="bg-green-100 border border-green-300 rounded-2xl p-5 mb-5 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <div className="font-bold text-green-700 text-lg">Все задания выполнены!</div>
                <div className="text-green-600 text-sm mt-1">Молодец, {child.name}!</div>
              </div>
            )}

            {todayTasks.length > 0 && (
              <div className="bg-white rounded-2xl p-3 mb-4 flex items-center gap-3 shadow-sm border border-orange-100">
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-orange-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${(submittedCount / todayTasks.length) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                  {submittedCount}/{todayTasks.length}
                </span>
              </div>
            )}

            {taskMsg && (
              <div className="bg-blue-100 border border-blue-300 rounded-xl p-3 mb-4 text-center text-blue-700 text-sm font-medium">
                {taskMsg}
              </div>
            )}

            {/* Suggest a task */}
            {!showSuggestTaskForm ? (
              <button onClick={() => setShowSuggestTaskForm(true)}
                className="w-full mb-4 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold py-3 rounded-2xl transition text-sm">
                Придумать своё задание
              </button>
            ) : (
              <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-indigo-700">Моё задание</span>
                  <button onClick={() => setShowSuggestTaskForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                <div className="space-y-3">
                  <input
                    value={suggestTaskTitle}
                    onChange={e => setSuggestTaskTitle(e.target.value)}
                    placeholder="Название задания *"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm"
                  />
                  <input
                    value={suggestTaskDesc}
                    onChange={e => setSuggestTaskDesc(e.target.value)}
                    placeholder="Описание (необязательно)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Родитель решит, сколько баллов и когда</p>
                <button onClick={handleSuggestTask} disabled={!suggestTaskTitle.trim()}
                  className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                  Отправить предложение
                </button>
              </div>
            )}

            {/* My pending task suggestions */}
            {myTaskSuggestions.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">Мои предложения заданий</h3>
                {myTaskSuggestions.map(t => (
                  <div key={t.id} className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-gray-700">{t.title}</span>
                      {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                    </div>
                    <span className="text-indigo-500 text-xs whitespace-nowrap ml-2">Ждём одобрения...</span>
                  </div>
                ))}
              </div>
            )}

            {todayTasks.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">😴</div>
                <div className="text-gray-500">Заданий на сегодня нет</div>
              </div>
            ) : (
              <div className="space-y-3">
                {todayTasks.map(task => {
                  const status: CompletionStatus = getCompletionStatus(task, childId);
                  const isOnce = task.recurrence === 'once' || task.reportAtEnd;
                  const cardStyle = {
                    none:    'bg-white border-orange-200 hover:border-orange-400',
                    pending: 'bg-yellow-50 border-yellow-300',
                    approved:'bg-green-50 border-green-300',
                    denied:  'bg-red-50 border-red-300 hover:border-red-400',
                  }[status];
                  const circleStyle = {
                    none:    'border-orange-300',
                    pending: 'bg-yellow-400 border-yellow-400',
                    approved:'bg-green-400 border-green-400',
                    denied:  'bg-red-400 border-red-400',
                  }[status];
                  const circleIcon = {
                    none: null,
                    pending: <span className="text-white text-xs">⏳</span>,
                    approved: <span className="text-white text-sm font-bold">✓</span>,
                    denied: <span className="text-white text-sm font-bold">✕</span>,
                  }[status];
                  const titleStyle = {
                    none:    'text-gray-800',
                    pending: 'text-yellow-700',
                    approved:'text-green-700 line-through',
                    denied:  'text-red-700',
                  }[status];
                  const statusLabel = {
                    none: null,
                    pending: <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">На проверке</span>,
                    approved: <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">Подтверждено ✓</span>,
                    denied: <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">Отклонено — нажми снова</span>,
                  }[status];
                  const comp = status !== 'none' ? state.completions.find(c =>
                    c.taskId === task.id && c.childId === childId &&
                    (task.recurrence === 'once' || task.reportAtEnd ? true : c.date === today)
                  ) : null;
                  const earnedPoints = comp?.adjustedReward ?? task.reward;
                  return (
                    <button key={task.id} onClick={() => handleToggle(task)}
                      disabled={status === 'approved'}
                      className={`w-full text-left rounded-2xl p-4 border-2 transition shadow-sm ${cardStyle}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition ${circleStyle}`}>
                          {circleIcon}
                        </div>
                        <div className="flex-1">
                          <div className={`font-semibold ${titleStyle}`}>{task.title}</div>
                          {task.description && (
                            <div className="text-sm text-gray-500 mt-0.5">{task.description}</div>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {statusLabel}
                            {earnedPoints > 0 && status !== 'denied' && (
                              <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                +{earnedPoints} ⭐
                              </span>
                            )}
                            {task.penalty > 0 && status === 'none' && (
                              <span className="bg-red-100 text-red-500 text-xs px-2 py-0.5 rounded-full font-medium">
                                штраф −{task.penalty}
                              </span>
                            )}
                            {isOnce && (
                              <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">
                                до {new Date(task.endDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                          {comp?.parentComment && (
                            <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-xs text-blue-700 flex items-start gap-1.5">
                              <span className="flex-shrink-0">💬</span>
                              <span>{comp.parentComment}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* REWARDS TAB */}
        {tab === 'rewards' && (
          <div>
            <div className="bg-orange-100 rounded-2xl p-4 mb-5">
              <div className="text-4xl font-bold text-orange-600 text-center">{balance}</div>
              <div className="text-orange-500 text-sm text-center mt-1">баллов доступно</div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                <div className="bg-white rounded-xl p-2">
                  <div className="font-bold text-green-600">+{earned}</div>
                  <div className="text-gray-400">заработано</div>
                </div>
                <div className="bg-white rounded-xl p-2">
                  <div className="font-bold text-purple-600">−{spent}</div>
                  <div className="text-gray-400">потрачено</div>
                </div>
                <div className="bg-white rounded-xl p-2">
                  <div className="font-bold text-red-500">−{autoPenalty + manualPenalty}</div>
                  <div className="text-gray-400">штрафы</div>
                </div>
              </div>
            </div>

            {claimMsg && (
              <div className="bg-blue-100 border border-blue-300 rounded-xl p-3 mb-4 text-center text-blue-700 text-sm font-medium">
                {claimMsg}
              </div>
            )}

            {/* Suggest a prize */}
            {!showSuggestForm ? (
              <button onClick={() => setShowSuggestForm(true)}
                className="w-full mb-4 bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold py-3 rounded-2xl transition text-sm">
                Придумать свой приз
              </button>
            ) : (
              <div className="bg-white border-2 border-purple-200 rounded-2xl p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-purple-700">Мой приз</span>
                  <button onClick={() => setShowSuggestForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                <div className="space-y-3">
                  <input
                    value={suggestTitle}
                    onChange={e => setSuggestTitle(e.target.value)}
                    placeholder="Название приза *"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-purple-400 text-sm"
                  />
                  <input
                    value={suggestDesc}
                    onChange={e => setSuggestDesc(e.target.value)}
                    placeholder="Описание (необязательно)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-purple-400 text-sm"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Родитель решит, сколько баллов нужно</p>
                <button onClick={handleSuggest} disabled={!suggestTitle.trim()}
                  className="mt-3 w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                  Отправить предложение
                </button>
              </div>
            )}

            {/* My pending suggestions */}
            {mySuggestions.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">Мои предложения</h3>
                {mySuggestions.map(r => (
                  <div key={r.id} className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-gray-700">{r.title}</span>
                      {r.description && <div className="text-xs text-gray-400">{r.description}</div>}
                    </div>
                    <span className="text-purple-500 text-xs whitespace-nowrap ml-2">Ждём цену...</span>
                  </div>
                ))}
              </div>
            )}

            {/* My redeemed rewards */}
            {myApprovedClaims.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">Мои призы</h3>
                <div className="space-y-2">
                  {[...myApprovedClaims]
                    .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
                    .slice(0, 5)
                    .map(claim => {
                      const reward = state.rewards.find(r => r.id === claim.rewardId);
                      const title = claim.rewardTitle ?? reward?.title ?? 'Удалённый приз';
                      const cost = claim.rewardCost ?? reward?.cost ?? 0;
                      return (
                        <div key={claim.id} className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-sm flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-700">🎁 {title}</span>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(claim.claimedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                          </div>
                          <span className="text-purple-600 font-medium ml-3 whitespace-nowrap">−{cost} ⭐</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {availableRewards.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-2">🎁</div>
                <div className="text-gray-400">Наград пока нет</div>
              </div>
            ) : (
              <div className="space-y-3">
                {availableRewards.map(reward => {
                  const canAfford = balance >= reward.cost;
                  return (
                    <div key={reward.id} className={`bg-white rounded-2xl p-4 border-2 shadow-sm ${
                      canAfford ? 'border-yellow-200' : 'border-gray-100 opacity-70'
                    }`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{reward.title}</div>
                          {reward.description && (
                            <div className="text-sm text-gray-500 mt-0.5">{reward.description}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                              {reward.cost} ⭐
                            </span>
                            {reward.suggestedBy === childId && (
                              <span className="bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded-full">моя идея</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => handleClaim(reward.id, reward.cost)}
                          disabled={!canAfford}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex-shrink-0 ${
                            canAfford
                              ? 'bg-orange-400 hover:bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}>
                          {canAfford ? 'Получить' : 'Мало'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && <PointsHistory childId={childId} />}
        {/* PROFILE TAB */}
        {tab === 'profile' && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-7xl mb-2">{profileAvatar}</div>
              <div className="text-lg font-bold text-gray-800">{profileName}</div>
            </div>

            {/* Avatar picker */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
              <label className="text-sm font-semibold text-gray-600 mb-3 block">Выбери аватар</label>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.map(a => (
                  <button key={a} onClick={() => setProfileAvatar(a)}
                    className={`text-3xl h-12 rounded-xl transition ${
                      profileAvatar === a
                        ? 'bg-orange-100 ring-2 ring-orange-400'
                        : 'hover:bg-orange-50'
                    }`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Name input */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
              <label className="text-sm font-semibold text-gray-600 mb-2 block">Имя</label>
              <input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-orange-400 text-sm"
                placeholder="Твоё имя"
              />
            </div>

            {profileSaved && (
              <div className="bg-green-100 border border-green-300 rounded-xl p-3 text-center text-green-700 text-sm font-medium">
                Профиль обновлён!
              </div>
            )}

            <button
              onClick={saveProfile}
              disabled={!profileName.trim() || (profileName.trim() === child.name && profileAvatar === child.avatar)}
              className="w-full bg-orange-400 hover:bg-orange-500 disabled:opacity-40 text-white py-3 rounded-2xl font-semibold transition">
              Сохранить
            </button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-orange-100 flex">
        {([
          { id: 'tasks', label: 'Задания', icon: '✅' },
          { id: 'rewards', label: 'Награды', icon: '🎁' },
          { id: 'history', label: 'История', icon: '📋' },
          { id: 'profile', label: 'Профиль', icon: '👤' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => t.id === 'profile' ? openProfile() : setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-3 text-xs transition ${
              tab === t.id ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'
            }`}>
            <span className="text-xl">{t.icon}</span>
            <span className="mt-0.5">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
