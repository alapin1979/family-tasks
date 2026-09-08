import { useState } from 'react';
import { useApp } from '../../context';
import { fmtPts, parsePts } from '../../utils';

type SubTab = 'rewards' | 'penalties';

export default function RewardsTab() {
  const {
    state, addReward, removeReward,
    setPriceForReward, getPendingSuggestions,
    addManualPenalty, removeManualPenalty,
  } = useApp();

  const [suggestionPrices, setSuggestionPrices] = useState<Record<string, number>>({});

  const [subTab, setSubTab] = useState<SubTab>('rewards');

  // Reward form
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [rTitle, setRTitle] = useState('');
  const [rDesc, setRDesc] = useState('');
  const [rCost, setRCost] = useState(50);
  const [rOneTime, setROneTime] = useState(false);
  const [rError, setRError] = useState('');

  // Penalty form
  const [showPenaltyForm, setShowPenaltyForm] = useState(false);
  const [pChildId, setPChildId] = useState('');
  const [pAmount, setPAmount] = useState(10);
  const [pReason, setPReason] = useState('');
  const [pError, setPError] = useState('');

  const pendingSuggestions = getPendingSuggestions();
  const recentClaims = [...state.rewardClaims]
    .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
    .slice(0, 10);

  function handleAddReward() {
    if (!rTitle.trim()) { setRError('Введите название'); return; }
    addReward({ title: rTitle.trim(), description: rDesc, cost: rCost, oneTime: rOneTime });
    setRTitle(''); setRDesc(''); setRCost(50); setROneTime(false); setRError('');
    setShowRewardForm(false);
  }

  function handleAddPenalty() {
    if (!pChildId) { setPError('Выберите ребёнка'); return; }
    if (!pReason.trim()) { setPError('Укажите причину'); return; }
    if (pAmount <= 0) { setPError('Сумма должна быть больше 0'); return; }
    addManualPenalty({ childId: pChildId, amount: pAmount, reason: pReason.trim(), createdAt: new Date().toISOString() });
    setPChildId(''); setPAmount(10); setPReason(''); setPError('');
    setShowPenaltyForm(false);
  }

  function getChildName(id: string) { return state.children.find(c => c.id === id)?.name ?? '?'; }
  function getChildAvatar(id: string) { return state.children.find(c => c.id === id)?.avatar ?? '?'; }
  function getRewardTitle(id: string) { return state.rewards.find(r => r.id === id)?.title ?? '?'; }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {([
          { id: 'rewards', label: '🎁 Награды' },
          { id: 'penalties', label: '⚡ Штрафы' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              subTab === t.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.id === 'rewards' && pendingSuggestions.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendingSuggestions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {subTab === 'rewards' && (
        <div className="space-y-4">
          {/* Recent redemptions log */}
          {recentClaims.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 mb-2">Потраченные призы</h3>
              <div className="space-y-2">
                {recentClaims.map(claim => (
                  <div key={claim.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center gap-3 text-sm">
                    <span className="text-xl">{getChildAvatar(claim.childId)}</span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-800">{getChildName(claim.childId)}</span>
                      <span className="text-gray-500"> получил(а) </span>
                      <span className="font-medium text-gray-800">
                        «{claim.rewardTitle ?? getRewardTitle(claim.rewardId)}»
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(claim.claimedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <span className="text-purple-600 font-medium whitespace-nowrap">
                      −{claim.rewardCost ?? state.rewards.find(r => r.id === claim.rewardId)?.cost ?? 0} ⭐
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Child suggestions waiting for price */}
          {pendingSuggestions.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 mb-2">Предложения детей</h3>
              <div className="space-y-2">
                {pendingSuggestions.map(r => {
                  const child = state.children.find(c => c.id === r.suggestedBy);
                  const price = suggestionPrices[r.id] ?? 50;
                  return (
                    <div key={r.id} className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                      <div className="flex items-start gap-2 mb-3">
                        <span className="text-2xl">{child?.avatar ?? '👤'}</span>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{r.title}</div>
                          {r.description && <div className="text-sm text-gray-500">{r.description}</div>}
                          <div className="text-xs text-purple-500 mt-0.5">предложил(а) {child?.name}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text" inputMode="numeric"
                          value={fmtPts(price)}
                          onChange={e => setSuggestionPrices(prev => ({ ...prev, [r.id]: Math.max(1, parsePts(e.target.value)) }))}
                          className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400"
                          placeholder="баллы"
                        />
                        <span className="text-sm text-gray-400">баллов</span>
                        <button
                          onClick={() => { setPriceForReward(r.id, price); setSuggestionPrices(prev => { const n = { ...prev }; delete n[r.id]; return n; }); }}
                          className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-xl text-sm font-semibold transition">
                          Одобрить
                        </button>
                        <button
                          onClick={() => removeReward(r.id)}
                          className="bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 py-2 px-3 rounded-xl text-sm transition">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add reward */}
          {!showRewardForm ? (
            <button onClick={() => setShowRewardForm(true)}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-2xl font-medium transition">
              + Добавить награду
            </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700">Новая награда</h4>
                <button onClick={() => { setShowRewardForm(false); setRError(''); }}
                  className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Название *</label>
                  <input value={rTitle} onChange={e => setRTitle(e.target.value)}
                    placeholder="например, 30 мин. экранного времени"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Описание</label>
                  <input value={rDesc} onChange={e => setRDesc(e.target.value)}
                    placeholder="например, Поход в цирк / Выходной день / 100 рублей"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Стоимость (баллы)</label>
                  <input type="text" inputMode="numeric" value={fmtPts(rCost)}
                    onChange={e => setRCost(Math.max(1, parsePts(e.target.value)))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={rOneTime} onChange={e => setROneTime(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500" />
                  <span className="text-sm text-gray-600">Одноразовый приз <span className="text-gray-400">(исчезнет после получения)</span></span>
                </label>
              </div>
              {rError && <p className="text-red-500 text-sm mt-2">{rError}</p>}
              <button onClick={handleAddReward}
                className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition">
                Добавить
              </button>
            </div>
          )}

          {/* Reward list (active only) */}
          <div className="space-y-2">
            {state.rewards.filter(r => !r.pendingCost).length === 0 && (
              <p className="text-gray-400 text-center py-8">Наград пока нет</p>
            )}
            {state.rewards.filter(r => !r.pendingCost).map(reward => {
              const suggester = reward.suggestedBy ? state.children.find(c => c.id === reward.suggestedBy) : null;
              return (
                <div key={reward.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{reward.title}</span>
                      <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {reward.cost} баллов
                      </span>
                      {reward.oneTime && (
                        <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full">одноразовый</span>
                      )}
                      {suggester && (
                        <span className="bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded-full">
                          идея {suggester.avatar} {suggester.name}
                        </span>
                      )}
                    </div>
                    {reward.description && (
                      <p className="text-gray-500 text-sm mt-0.5">{reward.description}</p>
                    )}
                  </div>
                  <button onClick={() => removeReward(reward.id)}
                    className="text-gray-300 hover:text-red-400 transition text-xl leading-none flex-shrink-0">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'penalties' && (
        <div className="space-y-4">
          {/* Add manual penalty */}
          {!showPenaltyForm ? (
            <button onClick={() => setShowPenaltyForm(true)}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-2xl font-medium transition">
              + Добавить штраф
            </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700">Новый штраф</h4>
                <button onClick={() => { setShowPenaltyForm(false); setPError(''); }}
                  className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Ребёнок *</label>
                  {state.children.length === 0 ? (
                    <p className="text-gray-400 text-sm">Нет детей</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {state.children.map(c => (
                        <button key={c.id} onClick={() => setPChildId(c.id)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border-2 transition ${
                            pChildId === c.id
                              ? 'border-red-400 bg-red-50 text-red-700'
                              : 'border-gray-200 text-gray-600 hover:border-red-300'
                          }`}>
                          <span>{c.avatar}</span> {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Причина *</label>
                  <input value={pReason} onChange={e => setPReason(e.target.value)}
                    placeholder="например, Плохое поведение"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-red-400 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Сумма штрафа (баллы)</label>
                  <input type="text" inputMode="numeric" value={fmtPts(pAmount)}
                    onChange={e => setPAmount(Math.max(1, parsePts(e.target.value)))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-red-400 text-sm" />
                </div>
              </div>
              {pError && <p className="text-red-500 text-sm mt-2">{pError}</p>}
              <button onClick={handleAddPenalty}
                className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium transition">
                Применить штраф
              </button>
            </div>
          )}

          {/* Manual penalty list */}
          <div className="space-y-2">
            {state.manualPenalties.length === 0 && (
              <p className="text-gray-400 text-center py-6">Ручных штрафов нет</p>
            )}
            {[...state.manualPenalties].reverse().map(p => (
              <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-red-100 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xl">{getChildAvatar(p.childId)}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800">{getChildName(p.childId)}</span>
                      <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">
                        −{p.amount} баллов
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">{p.reason}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
                <button onClick={() => removeManualPenalty(p.id)}
                  className="text-gray-300 hover:text-red-400 transition text-xl leading-none flex-shrink-0">✕</button>
              </div>
            ))}
          </div>

          {/* Auto-penalty info */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-xs text-gray-400 text-center">
              Автоматические штрафы за пропущенные задания рассчитываются на основе настроек каждого задания и отображаются в разделе «Обзор».
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
