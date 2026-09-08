import { useState } from 'react';
import { useApp } from '../../context';
import { isScheduledOn, todayStr, fmtPts, parsePts } from '../../utils';
import PointsHistory from '../PointsHistory';

export default function OverviewTab() {
  const {
    state, getChildEarned, getChildSpent, getChildAutoPenalty,
    getChildManualPenalty, getChildBalance, getChildManualAdjustment,
    addManualAdjustment, removeManualAdjustment,
  } = useApp();
  const today = todayStr();

  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [historyChildId, setHistoryChildId] = useState<string | null>(null);

  function openEdit(childId: string, currentBalance: number) {
    setEditingChildId(childId);
    setNewBalance(currentBalance);
    setAdjustReason('');
  }

  function saveEdit(childId: string, currentBalance: number) {
    const delta = newBalance - currentBalance;
    if (delta !== 0) {
      addManualAdjustment({
        childId,
        amount: delta,
        reason: adjustReason.trim() || 'Корректировка баланса',
        createdAt: new Date().toISOString(),
      });
    }
    setEditingChildId(null);
  }

  const activeTasks = state.tasks.filter(t => t.startDate <= today && t.endDate >= today);

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-2xl p-4 text-center">
          <div className="text-3xl font-bold text-indigo-600">{state.children.length}</div>
          <div className="text-xs text-indigo-400 mt-1">Детей</div>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{activeTasks.length}</div>
          <div className="text-xs text-blue-400 mt-1">Активных заданий</div>
        </div>
        <div className="bg-purple-50 rounded-2xl p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">{state.rewards.length}</div>
          <div className="text-xs text-purple-400 mt-1">Наград</div>
        </div>
      </div>

      {/* Per-child progress */}
      <div>
        <h3 className="font-bold text-gray-700 mb-3">Прогресс детей</h3>
        {state.children.length === 0 ? (
          <p className="text-gray-400 text-center py-6">Добавьте детей, чтобы видеть их прогресс</p>
        ) : (
          <div className="space-y-3">
            {state.children.map(child => {
              const earned = getChildEarned(child.id);
              const spent = getChildSpent(child.id);
              const autoPenalty = getChildAutoPenalty(child.id);
              const manualPenalty = getChildManualPenalty(child.id);
              const adjustment = getChildManualAdjustment(child.id);
              const balance = getChildBalance(child.id);
              const isEditing = editingChildId === child.id;

              const childTodayTasks = activeTasks.filter(t =>
                t.assignedTo.includes(child.id) && isScheduledOn(t, today)
              );
              const completedToday = childTodayTasks.filter(t => {
                if (t.recurrence === 'once' || t.reportAtEnd) {
                  return state.completions.some(
                    c => c.taskId === t.id && c.childId === child.id && (c.approved === null || c.approved === true)
                  );
                }
                return state.completions.some(
                  c => c.taskId === t.id && c.childId === child.id && c.date === today && (c.approved === null || c.approved === true)
                );
              }).length;

              // Adjustment history for this child
              const childAdjustments = (state.manualAdjustments ?? [])
                .filter(a => a.childId === child.id)
                .slice()
                .reverse();

              return (
                <div key={child.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{child.avatar}</span>
                      <span className="font-semibold text-gray-800">{child.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className={`font-bold text-lg ${balance >= 0 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {balance} ⭐
                        </div>
                        <div className="text-xs text-gray-400">баланс</div>
                      </div>
                      <button
                        onClick={() => isEditing ? setEditingChildId(null) : openEdit(child.id, balance)}
                        className="text-gray-300 hover:text-indigo-400 transition text-lg leading-none px-1"
                        title="Изменить баланс">
                        {isEditing ? '✕' : '✏️'}
                      </button>
                    </div>
                  </div>

                  {/* Inline balance editor */}
                  {isEditing && (
                    <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                      <div className="text-xs text-indigo-600 font-medium mb-1">Установить новый баланс</div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500 whitespace-nowrap">Баланс:</label>
                        <input
                          type="text" inputMode="numeric"
                          value={fmtPts(newBalance)}
                          onChange={e => setNewBalance(parsePts(e.target.value))}
                          className="w-28 border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-400 text-center"
                        />
                        <span className="text-xs text-gray-400">⭐ (сейчас {fmtPts(balance)})</span>
                      </div>
                      <input
                        type="text"
                        value={adjustReason}
                        onChange={e => setAdjustReason(e.target.value)}
                        placeholder="Причина (необязательно)"
                        className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                      />
                      <button
                        onClick={() => saveEdit(child.id, balance)}
                        className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold transition">
                        {newBalance === balance ? 'Закрыть' : `Установить ${newBalance} ⭐`}
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-green-50 rounded-xl p-2">
                      <div className="font-bold text-green-600 text-sm">{completedToday}/{childTodayTasks.length}</div>
                      <div className="text-xs text-gray-400">сегодня</div>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-2">
                      <div className="font-bold text-yellow-600 text-sm">+{earned}</div>
                      <div className="text-xs text-gray-400">заработано</div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-2">
                      <div className="font-bold text-purple-600 text-sm">−{spent}</div>
                      <div className="text-xs text-gray-400">потрачено</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-2">
                      <div className="font-bold text-red-500 text-sm">−{autoPenalty + manualPenalty}</div>
                      <div className="text-xs text-gray-400">штрафы</div>
                    </div>
                  </div>

                  {(autoPenalty > 0 || manualPenalty > 0 || adjustment !== 0) && (
                    <div className="mt-2 text-xs text-gray-400 flex gap-3 flex-wrap">
                      {autoPenalty > 0 && <span>Авто: −{autoPenalty}</span>}
                      {manualPenalty > 0 && <span>Ручные: −{manualPenalty}</span>}
                      {adjustment !== 0 && (
                        <span className={adjustment > 0 ? 'text-green-500' : 'text-red-400'}>
                          Корр.: {adjustment > 0 ? '+' : ''}{adjustment}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Adjustment history */}
                  {childAdjustments.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="text-xs text-gray-400 font-medium">Корректировки баланса:</div>
                      {childAdjustments.map(a => {
                        const task = a.taskId ? state.tasks.find(t => t.id === a.taskId) : undefined;
                        const forDate = a.forDate ?? a.createdAt.split('T')[0];
                        const backdated = a.forDate && a.forDate !== a.createdAt.split('T')[0];
                        return (
                          <div key={a.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                            <div className="flex-1 min-w-0">
                              <span className={`font-medium ${a.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {a.amount >= 0 ? '+' : ''}{a.amount} ⭐
                              </span>
                              <span className="text-gray-500 ml-1.5">{a.reason}</span>
                              {task && <span className="text-gray-400 ml-1">({task.title})</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              <span className="text-gray-300">
                                {new Date(forDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                {backdated && ' *'}
                              </span>
                              <button onClick={() => removeManualAdjustment(a.id)}
                                className="text-gray-200 hover:text-red-400 transition leading-none">✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Points history toggle */}
                  <button
                    onClick={() => setHistoryChildId(historyChildId === child.id ? null : child.id)}
                    className="mt-3 w-full text-xs text-indigo-500 hover:text-indigo-700 font-medium py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
                    {historyChildId === child.id ? '▲ Скрыть историю баллов' : '▼ История баллов'}
                  </button>

                  {historyChildId === child.id && (
                    <div className="mt-3">
                      <PointsHistory childId={child.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approved reward history */}
      {state.rewardClaims.filter(c => c.approved).length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 mb-3">История полученных наград</h3>
          <div className="space-y-2">
            {state.rewardClaims.filter(c => c.approved).slice(-10).reverse().map(claim => {
              const child = state.children.find(c => c.id === claim.childId);
              const reward = state.rewards.find(r => r.id === claim.rewardId);
              const title = claim.rewardTitle ?? reward?.title ?? 'Удалённый приз';
              const cost = claim.rewardCost ?? reward?.cost;
              return (
                <div key={claim.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-sm">
                  <span>
                    <span className="mr-1">{child?.avatar}</span>
                    <span className="font-medium">{child?.name}</span>
                    <span className="text-gray-500"> получил(а) </span>
                    <span className="font-medium">«{title}»</span>
                  </span>
                  <span className="text-purple-600 font-medium">{cost != null ? `−${cost} ⭐` : '–'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
