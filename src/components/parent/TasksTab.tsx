import { useState } from 'react';
import { useApp } from '../../context';
import type { Task, RecurrenceType } from '../../types';
import { DOW_LABELS, DOW_ORDER, recurrenceLabel, todayStr, fmtPts, parsePts } from '../../utils';

function inOneWeek() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

const EMPTY: Omit<Task, 'id'> = {
  title: '',
  description: '',
  reward: 10,
  penalty: 0,
  assignedTo: [],
  startDate: todayStr(),
  endDate: inOneWeek(),
  recurrence: 'daily',
  specificDays: [],
  reportAtEnd: false,
};

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; hint: string }[] = [
  { value: 'once', label: 'Один раз', hint: 'Выполнить однажды за весь период (напр. прочитать книгу)' },
  { value: 'daily', label: 'Каждый день', hint: 'Выполнять каждый день периода' },
  { value: 'weekdays', label: 'По будням', hint: 'Пн–Пт каждой недели (напр. домашняя работа)' },
  { value: 'specific_days', label: 'По выбранным дням', hint: 'Только выбранные дни недели (напр. тренировки)' },
];

export default function TasksTab() {
  const { state, addTask, editTask, removeTask } = useApp();
  const [form, setForm] = useState<Omit<Task, 'id'>>(EMPTY);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  function set<K extends keyof Omit<Task, 'id'>>(key: K, value: Omit<Task, 'id'>[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  }

  function toggleDay(dow: number) {
    setForm(f => ({
      ...f,
      specificDays: f.specificDays.includes(dow)
        ? f.specificDays.filter(d => d !== dow)
        : [...f.specificDays, dow],
    }));
  }

  function toggleChild(id: string) {
    setForm(f => ({
      ...f,
      assignedTo: f.assignedTo.includes(id)
        ? f.assignedTo.filter(c => c !== id)
        : [...f.assignedTo, id],
    }));
  }

  function openEdit(task: Task) {
    const { id: _id, ...rest } = task;
    setForm(rest);
    setEditingTaskId(task.id);
    setShowForm(true);
    setError('');
  }

  function handleClose() {
    setShowForm(false);
    setEditingTaskId(null);
    setForm(EMPTY);
    setError('');
  }

  function handleSave() {
    if (!form.title.trim()) { setError('Введите название задания'); return; }
    if (form.assignedTo.length === 0) { setError('Назначьте хотя бы одному ребёнку'); return; }
    if (form.startDate > form.endDate) { setError('Дата окончания должна быть позже даты начала'); return; }
    if (form.recurrence === 'specific_days' && form.specificDays.length === 0) {
      setError('Выберите хотя бы один день недели'); return;
    }
    if (editingTaskId) {
      editTask(editingTaskId, { ...form, pendingApproval: false });
    } else {
      addTask(form);
    }
    handleClose();
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const childName = (id: string) => state.children.find(c => c.id === id)?.name ?? '?';
  const childAvatar = (id: string) => state.children.find(c => c.id === id)?.avatar ?? '?';

  const isRecurring = form.recurrence !== 'once';
  const pendingTaskSuggestions = state.tasks.filter(t => t.pendingApproval);
  const activeTasks = state.tasks.filter(t => !t.pendingApproval);

  return (
    <div className="space-y-4">
      {/* Child-suggested tasks awaiting approval */}
      {pendingTaskSuggestions.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-700 mb-2">Предложения детей</h3>
          <div className="space-y-2">
            {pendingTaskSuggestions.map(t => {
              const child = state.children.find(c => c.id === t.suggestedBy);
              return (
                <div key={t.id} className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-2xl">{child?.avatar ?? '👤'}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{t.title}</div>
                      {t.description && <div className="text-sm text-gray-500">{t.description}</div>}
                      <div className="text-xs text-indigo-500 mt-0.5">предложил(а) {child?.name}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => removeTask(t.id)}
                      className="bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500 py-2 px-3 rounded-xl text-sm transition">
                      Отклонить
                    </button>
                    <button
                      onClick={() => openEdit(t)}
                      className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold transition">
                      Настроить и одобрить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!showForm ? (
        <button onClick={() => { setShowForm(true); setEditingTaskId(null); setForm(EMPTY); }}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-2xl font-medium transition">
          + Новое задание
        </button>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-700">
              {editingTaskId ? 'Редактировать задание' : 'Новое задание'}
            </h3>
            <button onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Название *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="например, Домашняя работа"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Описание</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Дополнительные детали..."
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm resize-none" />
            </div>

            {/* Recurrence */}
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Повторение</label>
              <div className="grid grid-cols-2 gap-2">
                {RECURRENCE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => {
                    set('recurrence', opt.value);
                    if (opt.value === 'once') set('reportAtEnd', false);
                  }}
                    className={`text-left px-3 py-2.5 rounded-xl border-2 transition ${
                      form.recurrence === opt.value
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}>
                    <div className={`text-sm font-medium ${form.recurrence === opt.value ? 'text-indigo-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-tight">{opt.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Day picker for specific_days */}
            {form.recurrence === 'specific_days' && (
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Дни недели *</label>
                <div className="flex gap-2">
                  {DOW_ORDER.map(dow => (
                    <button key={dow} onClick={() => toggleDay(dow)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition ${
                        form.specificDays.includes(dow)
                          ? 'bg-indigo-500 border-indigo-500 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                      }`}>
                      {DOW_LABELS[dow]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Report mode — only for recurring tasks */}
            {isRecurring && (
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Способ выполнения</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => set('reportAtEnd', false)}
                    className={`text-left px-3 py-2.5 rounded-xl border-2 transition ${
                      !form.reportAtEnd ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                    }`}>
                    <div className={`text-sm font-medium ${!form.reportAtEnd ? 'text-indigo-700' : 'text-gray-700'}`}>
                      Отмечать каждый раз
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Ребёнок отмечает выполнение каждый день</div>
                  </button>
                  <button onClick={() => set('reportAtEnd', true)}
                    className={`text-left px-3 py-2.5 rounded-xl border-2 transition ${
                      form.reportAtEnd ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                    }`}>
                    <div className={`text-sm font-medium ${form.reportAtEnd ? 'text-indigo-700' : 'text-gray-700'}`}>
                      Отчитаться в конце
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Одна отметка за весь период</div>
                  </button>
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-500 mb-1 block">Начало</label>
                <input type="date" value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-1 block">Конец</label>
                <input type="date" value={form.endDate}
                  onChange={e => set('endDate', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
              </div>
            </div>

            {/* Reward & Penalty */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-500 mb-1 block">Награда (баллы)</label>
                <input type="text" inputMode="numeric" value={fmtPts(form.reward)}
                  onChange={e => set('reward', Math.max(0, parsePts(e.target.value)))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-1 block">Штраф за пропуск</label>
                <input type="text" inputMode="numeric" value={fmtPts(form.penalty)}
                  onChange={e => set('penalty', Math.max(0, parsePts(e.target.value)))}
                  placeholder="0 = нет штрафа"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-red-400 text-sm" />
              </div>
            </div>

            {/* Assign to */}
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Назначить *</label>
              {state.children.length === 0 ? (
                <p className="text-gray-400 text-sm">Сначала добавьте детей</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.children.map(c => (
                    <button key={c.id} onClick={() => toggleChild(c.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border-2 transition ${
                        form.assignedTo.includes(c.id)
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                      }`}>
                      <span>{c.avatar}</span> {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <button onClick={handleSave}
            className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition">
            {editingTaskId ? 'Сохранить изменения' : 'Создать задание'}
          </button>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-3">
        {activeTasks.length === 0 && (
          <p className="text-gray-400 text-center py-8">Заданий пока нет</p>
        )}
        {activeTasks.map(task => (
          <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="font-semibold text-gray-800">{task.title}</span>
                  {task.reward > 0 && (
                    <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                      +{task.reward} ⭐
                    </span>
                  )}
                  {task.penalty > 0 && (
                    <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                      −{task.penalty} штраф
                    </span>
                  )}
                  {task.suggestedBy && (
                    <span className="bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                      идея {childAvatar(task.suggestedBy)} {childName(task.suggestedBy)}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-gray-500 text-sm">{task.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs text-gray-400">
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{recurrenceLabel(task)}</span>
                  {(task.recurrence !== 'once') && (
                    <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {task.reportAtEnd ? 'Отчёт в конце' : 'Каждый раз'}
                    </span>
                  )}
                  <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {formatDate(task.startDate)} → {formatDate(task.endDate)}
                  </span>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {task.assignedTo.map(id => (
                    <span key={id} className="flex items-center gap-0.5 bg-gray-100 rounded-full px-2 py-0.5 text-xs text-gray-600">
                      {childAvatar(id)} {childName(id)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button onClick={() => openEdit(task)}
                  className="text-gray-300 hover:text-indigo-400 transition text-lg leading-none px-1"
                  title="Редактировать">✏️</button>
                <button onClick={() => removeTask(task.id)}
                  className="text-gray-300 hover:text-red-400 transition text-xl leading-none"
                  title="Удалить">✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
