import { useState } from 'react';
import { useApp } from '../../context';
import { fmtPts, parsePts } from '../../utils';

export default function ApprovalsTab() {
  const { state, approveCompletion, denyCompletion, getPendingCompletions } = useApp();
  const pending = getPendingCompletions();
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  if (pending.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-3">✅</div>
        <div className="text-gray-500">Нет заданий на проверку</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Ребёнок отметил задание как выполненное — подтвердите или отклоните.</p>
      {pending.map(comp => {
        const task = state.tasks.find(t => t.id === comp.taskId);
        const child = state.children.find(c => c.id === comp.childId);
        const dateLabel = new Date(comp.date + 'T12:00:00').toLocaleDateString('ru-RU', {
          weekday: 'short', day: 'numeric', month: 'short',
        });
        const defaultPoints = task?.reward ?? 0;
        const points = adjustments[comp.id] ?? defaultPoints;
        const comment = comments[comp.id] ?? '';

        function setPoints(v: number) {
          setAdjustments(prev => ({ ...prev, [comp.id]: Math.max(0, v) }));
        }
        function setComment(v: string) {
          setComments(prev => ({ ...prev, [comp.id]: v }));
        }

        const effectivePoints = adjustments[comp.id] !== undefined ? adjustments[comp.id] : undefined;

        return (
          <div key={comp.id} className="bg-white rounded-2xl shadow-sm border border-yellow-200 p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl flex-shrink-0">{child?.avatar ?? '👤'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800">{task?.title ?? 'Удалённое задание'}</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {child?.name} · {dateLabel}
                </div>
                {task && task.penalty > 0 && (
                  <span className="inline-block mt-1 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                    штраф −{task.penalty}
                  </span>
                )}
              </div>
            </div>

            {/* Point adjustment */}
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">Баллы:</label>
              <input
                type="text" inputMode="numeric"
                value={fmtPts(points)}
                onChange={e => setPoints(parsePts(e.target.value))}
                className="w-24 border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-400 text-center"
              />
              {points !== defaultPoints && (
                <button onClick={() => setAdjustments(prev => { const n = { ...prev }; delete n[comp.id]; return n; })}
                  className="text-xs text-gray-400 hover:text-gray-600 underline">
                  сбросить ({defaultPoints})
                </button>
              )}
            </div>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Комментарий для ребёнка (необязательно)"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none mb-2"
            />

            <div className="flex gap-2">
              <button
                onClick={() => approveCompletion(comp.id, effectivePoints, comment.trim() || undefined)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl text-sm font-semibold transition">
                ✓ Подтвердить{points > 0 ? ` +${points} ⭐` : ''}
              </button>
              <button
                onClick={() => denyCompletion(comp.id, comment.trim() || undefined)}
                className="flex-1 bg-red-100 hover:bg-red-200 text-red-600 py-2 rounded-xl text-sm font-semibold transition">
                ✕ Отклонить
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
