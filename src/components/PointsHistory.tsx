import { useState } from 'react';
import { useApp } from '../context';
import { getScheduledDatesBefore, todayStr, fmtPts, parsePts } from '../utils';
import type { AppState, Task } from '../types';

function rewardForDate(task: Task, date: string): number {
  const history = [...(task.rewardHistory ?? [])].sort((a, b) => a.until.localeCompare(b.until));
  for (const h of history) {
    if (date < h.until) return h.reward;
  }
  return task.reward;
}

function penaltyForDate(task: Task, date: string): number {
  const history = [...(task.penaltyHistory ?? [])].sort((a, b) => a.until.localeCompare(b.until));
  for (const h of history) {
    if (date < h.until) return h.penalty;
  }
  return task.penalty;
}

interface Entry {
  type: 'earned' | 'spent' | 'auto_penalty' | 'manual_penalty' | 'adjustment' | 'task_edit';
  sortKey: string;
  points: number;
  label: string;
  date: string;
  note?: string;
}

function buildLedger(childId: string, state: AppState): Entry[] {
  const entries: Entry[] = [];
  const today = todayStr();

  for (const comp of state.completions) {
    if (comp.childId !== childId || comp.approved !== true) continue;
    const task = state.tasks.find(t => t.id === comp.taskId);
    const normal = task ? rewardForDate(task, comp.date) : 0;
    const pts = comp.adjustedReward ?? normal;
    const notes: string[] = [];
    if (comp.adjustedReward != null && comp.adjustedReward !== normal) {
      notes.push(`изменено родителем: ${normal} → ${comp.adjustedReward} ⭐`);
    }
    if (comp.parentComment) notes.push(comp.parentComment);
    entries.push({ type: 'earned', sortKey: comp.completedAt, points: pts, label: task?.title ?? 'Удалённое задание', date: comp.date, note: notes.join(' · ') || undefined });
  }

  for (const claim of state.rewardClaims) {
    if (claim.childId !== childId || !claim.approved) continue;
    const reward = state.rewards.find(r => r.id === claim.rewardId);
    const cost = claim.rewardCost ?? reward?.cost ?? 0;
    const title = claim.rewardTitle ?? reward?.title ?? 'Удалённая награда';
    entries.push({ type: 'spent', sortKey: claim.claimedAt, points: -cost, label: title, date: claim.claimedAt.split('T')[0] });
  }

  for (const p of state.manualPenalties) {
    if (p.childId !== childId) continue;
    const entryDate = p.forDate ?? p.createdAt.split('T')[0];
    const backdated = p.forDate && p.forDate !== p.createdAt.split('T')[0]
      ? `внесено ${fmtDate(p.createdAt.split('T')[0])}` : undefined;
    entries.push({ type: 'manual_penalty', sortKey: p.createdAt, points: -p.amount, label: p.reason, date: entryDate, note: backdated });
  }

  for (const a of state.manualAdjustments ?? []) {
    if (a.childId !== childId) continue;
    const task = a.taskId ? state.tasks.find(t => t.id === a.taskId) : undefined;
    const label = task ? `${a.reason} (${task.title})` : a.reason;
    const entryDate = a.forDate ?? a.createdAt.split('T')[0];
    const backdated = a.forDate && a.forDate !== a.createdAt.split('T')[0]
      ? `внесено ${fmtDate(a.createdAt.split('T')[0])}` : undefined;
    entries.push({ type: 'adjustment', sortKey: a.createdAt, points: a.amount, label, date: entryDate, note: backdated });
  }

  for (const log of state.taskEditLog ?? []) {
    if (!log.childIds.includes(childId)) continue;
    const fieldLabel = log.field === 'reward' ? 'награда' : 'штраф';
    entries.push({
      type: 'task_edit', sortKey: log.changedAt, points: 0, label: log.taskTitle,
      date: log.changedAt.split('T')[0],
      note: `${fieldLabel}: ${log.oldValue} → ${log.newValue} ⭐`,
    });
  }

  for (const task of state.tasks) {
    if (task.pendingApproval) continue;
    if (!task.assignedTo.includes(childId)) continue;
    if (task.recurrence === 'once' || task.reportAtEnd) {
      if (task.endDate < today) {
        const penalty = penaltyForDate(task, task.endDate);
        if (penalty === 0) continue;
        const hasValid = state.completions.some(
          c => c.taskId === task.id && c.childId === childId && (c.approved === true || c.approved === null)
        );
        if (!hasValid)
          entries.push({ type: 'auto_penalty', sortKey: task.endDate + 'T23:59:59', points: -penalty, label: task.title, date: task.endDate, note: 'не выполнено' });
      }
    } else {
      for (const date of getScheduledDatesBefore(task, today)) {
        const penalty = penaltyForDate(task, date);
        if (penalty === 0) continue;
        const hasValid = state.completions.some(
          c => c.taskId === task.id && c.childId === childId && c.date === date && (c.approved === true || c.approved === null)
        );
        if (!hasValid)
          entries.push({ type: 'auto_penalty', sortKey: date + 'T23:59:59', points: -penalty, label: task.title, date, note: 'пропущено' });
      }
    }
  }

  entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return entries;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TYPE_META = {
  earned:         { icon: '✅', label: 'Задание выполнено',    bg: 'bg-green-50',  border: 'border-green-100'  },
  spent:          { icon: '🎁', label: 'Приз получен',         bg: 'bg-purple-50', border: 'border-purple-100' },
  auto_penalty:   { icon: '⏰', label: 'Штраф за пропуск',    bg: 'bg-red-50',    border: 'border-red-100'    },
  manual_penalty: { icon: '⚡', label: 'Штраф от родителя',   bg: 'bg-red-50',    border: 'border-red-100'    },
  adjustment:     { icon: '🔧', label: 'Корректировка баланса', bg: 'bg-blue-50',  border: 'border-blue-100'   },
  task_edit:      { icon: '📝', label: 'Изменено задание',    bg: 'bg-gray-50',   border: 'border-gray-200'   },
} as const;

function ptsColor(e: Entry) {
  if (e.type === 'earned') return 'text-green-600';
  if (e.type === 'spent') return 'text-purple-600';
  if (e.type === 'auto_penalty' || e.type === 'manual_penalty') return 'text-red-500';
  if (e.type === 'task_edit') return 'text-gray-400';
  return e.points >= 0 ? 'text-green-600' : 'text-orange-500';
}

interface Props { childId: string }

export default function PointsHistory({ childId }: Props) {
  const {
    state,
    getChildEarned, getChildSpent, getChildAutoPenalty,
    getChildManualPenalty, getChildManualAdjustment, getChildBalance,
    addManualAdjustment,
  } = useApp();

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [corrAmount, setCorrAmount] = useState(0);
  const [corrReason, setCorrReason] = useState('');
  const [corrTaskId, setCorrTaskId] = useState('');
  const [corrError, setCorrError] = useState('');

  const earned = getChildEarned(childId);
  const spent = getChildSpent(childId);
  const autoPenalty = getChildAutoPenalty(childId);
  const manualPenalty = getChildManualPenalty(childId);
  const adjustment = getChildManualAdjustment(childId);
  const balance = getChildBalance(childId);
  const allEntries = buildLedger(childId, state);
  const entries = selectedDate ? allEntries.filter(e => e.date === selectedDate) : allEntries;
  const childTasks = state.tasks.filter(t => t.assignedTo.includes(childId));

  function handleAddCorrection() {
    if (!selectedDate) return;
    if (!corrReason.trim()) { setCorrError('Укажите причину'); return; }
    if (corrAmount === 0) { setCorrError('Сумма не может быть 0'); return; }
    addManualAdjustment({
      childId,
      amount: corrAmount,
      reason: corrReason.trim(),
      createdAt: new Date().toISOString(),
      forDate: selectedDate,
      ...(corrTaskId ? { taskId: corrTaskId } : {}),
    });
    setCorrAmount(0); setCorrReason(''); setCorrTaskId(''); setCorrError('');
    setShowCorrectionForm(false);
  }

  return (
    <div className="space-y-4">
      {/* Formula summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Итоговый расчёт</div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">✅ Заработано</span>
            <span className="font-semibold text-green-600">+{earned} ⭐</span>
          </div>
          {spent > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">🎁 Потрачено на призы</span>
              <span className="font-semibold text-purple-600">−{spent} ⭐</span>
            </div>
          )}
          {autoPenalty > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">⏰ Штрафы за пропуски</span>
              <span className="font-semibold text-red-500">−{autoPenalty} ⭐</span>
            </div>
          )}
          {manualPenalty > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">⚡ Ручные штрафы</span>
              <span className="font-semibold text-red-500">−{manualPenalty} ⭐</span>
            </div>
          )}
          {adjustment !== 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">🔧 Корректировки</span>
              <span className={`font-semibold ${adjustment > 0 ? 'text-green-600' : 'text-orange-500'}`}>
                {adjustment > 0 ? '+' : ''}{adjustment} ⭐
              </span>
            </div>
          )}
          <div className="border-t border-gray-100 pt-2 mt-1 flex justify-between font-bold text-base">
            <span className="text-gray-700">= Баланс</span>
            <span className={balance >= 0 ? 'text-orange-500' : 'text-red-500'}>{balance} ⭐</span>
          </div>
        </div>
      </div>

      {/* Day picker */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Показать день</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setShowCorrectionForm(false); setCorrError(''); }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400"
          />
          {selectedDate && (
            <button
              onClick={() => { setSelectedDate(''); setShowCorrectionForm(false); }}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
              Показать всё
            </button>
          )}
        </div>

        {selectedDate && !showCorrectionForm && (
          <button
            onClick={() => setShowCorrectionForm(true)}
            className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium transition">
            + Добавить корректировку за {fmtDate(selectedDate)}
          </button>
        )}

        {selectedDate && showCorrectionForm && (
          <div className="mt-3 border border-indigo-200 bg-indigo-50 rounded-xl p-3 space-y-2">
            <div className="text-xs text-indigo-600 font-medium">Корректировка за {fmtDate(selectedDate)}</div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">Баллы:</label>
              <input
                type="text" inputMode="numeric"
                value={corrAmount === 0 ? '' : (corrAmount > 0 ? `+${fmtPts(corrAmount)}` : `-${fmtPts(-corrAmount)}`)}
                onChange={e => {
                  const raw = e.target.value.trim();
                  const negative = raw.startsWith('-');
                  const n = parsePts(raw.replace(/^[+-]/, ''));
                  setCorrAmount(negative ? -n : n);
                }}
                placeholder="например -5 или +10"
                className="w-32 border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            {childTasks.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Связано с заданием (необязательно)</label>
                <select
                  value={corrTaskId}
                  onChange={e => setCorrTaskId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-400 bg-white">
                  <option value="">— не выбрано —</option>
                  {childTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            )}
            <input
              type="text"
              value={corrReason}
              onChange={e => setCorrReason(e.target.value)}
              placeholder="Причина корректировки *"
              className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            {corrError && <p className="text-red-500 text-xs">{corrError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCorrectionForm(false); setCorrError(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-xl text-sm font-medium transition">
                Отмена
              </button>
              <button
                onClick={handleAddCorrection}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold transition">
                Сохранить
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chronological ledger */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📋</div>
          <div>{selectedDate ? `Нет записей за ${fmtDate(selectedDate)}` : 'История пуста'}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => {
            const meta = TYPE_META[e.type];
            const sign = e.points >= 0 ? '+' : '';
            return (
              <div key={`${e.type}|${e.sortKey}|${i}`}
                className={`rounded-xl px-3 py-2.5 border text-sm flex items-start gap-3 ${meta.bg} ${meta.border}`}>
                <span className="text-lg flex-shrink-0 leading-tight mt-0.5">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-gray-800 leading-snug">{e.label}</span>
                    {e.type !== 'task_edit' && (
                      <span className={`font-bold whitespace-nowrap flex-shrink-0 ${ptsColor(e)}`}>
                        {sign}{e.points} ⭐
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-1.5 flex-wrap items-center">
                    <span>{fmtDate(e.date)}</span>
                    <span>·</span>
                    <span>{meta.label}</span>
                    {e.note && <><span>·</span><span className="italic">{e.note}</span></>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
