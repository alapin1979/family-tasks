import { useState } from 'react';
import { useApp } from '../context';
import type { ActiveView } from '../types';

interface Props {
  onSelect: (view: ActiveView, childId?: string) => void;
  familyLogin?: string;
  onSwitchFamily?: () => void;
}

export default function HomeScreen({ onSelect, familyLogin, onSwitchFamily }: Props) {
  const { state, loaded, setParentPin } = useApp();
  const [showParentPin, setShowParentPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showCreateParentPin, setShowCreateParentPin] = useState(false);
  const [newParentPin, setNewParentPin] = useState('');
  const [confirmParentPin, setConfirmParentPin] = useState('');
  const [createPinError, setCreatePinError] = useState('');
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [selectedChild, setSelectedChild] = useState('');
  const [childPin, setChildPin] = useState('');
  const [childPinError, setChildPinError] = useState(false);

  function handleParentClick() {
    if (!state.parentPin) {
      setShowCreateParentPin(true);
    } else {
      setShowParentPin(true);
    }
  }

  function handleParentSubmit() {
    if (pin === state.parentPin) {
      onSelect('parent');
    } else {
      setPinError(true);
      setPin('');
    }
  }

  function handleCreateParentPin() {
    if (newParentPin.length < 4) { setCreatePinError('PIN должен быть не менее 4 цифр'); return; }
    if (newParentPin !== confirmParentPin) { setCreatePinError('PIN-коды не совпадают'); return; }
    setParentPin(newParentPin);
    setShowCreateParentPin(false);
    setNewParentPin('');
    setConfirmParentPin('');
    setCreatePinError('');
    onSelect('parent');
  }

  function handleChildLogin() {
    const child = state.children.find(c => c.id === selectedChild);
    if (!child) return;
    if (child.pin === childPin) {
      onSelect('child', selectedChild);
    } else {
      setChildPinError(true);
      setChildPin('');
    }
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">🌟</div>
          <p className="text-gray-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (showParentPin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <button onClick={() => { setShowParentPin(false); setPin(''); setPinError(false); }}
            className="text-gray-400 hover:text-gray-600 mb-4 text-sm">
            ← Назад
          </button>
          <div className="text-4xl mb-3 text-center">🔐</div>
          <h2 className="text-xl font-bold text-center text-gray-800 mb-1">Вход для родителя</h2>
          <p className="text-gray-500 text-sm text-center mb-6">Введите PIN-код для входа</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={e => { setPin(e.target.value); setPinError(false); }}
            onKeyDown={e => e.key === 'Enter' && handleParentSubmit()}
            placeholder="Введите PIN"
            className={`w-full border-2 rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none transition ${
              pinError ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-indigo-400'
            }`}
            autoFocus
          />
          {pinError && <p className="text-red-500 text-sm text-center mt-2">Неверный PIN-код</p>}
          <button onClick={handleParentSubmit}
            className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl transition">
            Войти
          </button>
        </div>
      </div>
    );
  }

  if (showCreateParentPin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <button onClick={() => { setShowCreateParentPin(false); setNewParentPin(''); setConfirmParentPin(''); setCreatePinError(''); }}
            className="text-gray-400 hover:text-gray-600 mb-4 text-sm">
            ← Назад
          </button>
          <div className="text-4xl mb-3 text-center">🔐</div>
          <h2 className="text-xl font-bold text-center text-gray-800 mb-1">Придумайте PIN родителя</h2>
          <p className="text-gray-500 text-sm text-center mb-6">Это ваш первый вход — задайте PIN-код для входа родителя</p>
          <div className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={newParentPin}
              onChange={e => { setNewParentPin(e.target.value.replace(/\D/g, '')); setCreatePinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCreateParentPin()}
              placeholder="Новый PIN (4+ цифры)"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-indigo-400 transition"
              autoFocus
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={confirmParentPin}
              onChange={e => { setConfirmParentPin(e.target.value.replace(/\D/g, '')); setCreatePinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCreateParentPin()}
              placeholder="Повторите PIN"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-indigo-400 transition"
            />
          </div>
          {createPinError && <p className="text-red-500 text-sm text-center mt-2">{createPinError}</p>}
          <button onClick={handleCreateParentPin}
            className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl transition">
            Сохранить и войти
          </button>
        </div>
      </div>
    );
  }

  if (showChildPicker) {
    const child = state.children.find(c => c.id === selectedChild);
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <button onClick={() => { setShowChildPicker(false); setSelectedChild(''); setChildPin(''); setChildPinError(false); }}
            className="text-gray-400 hover:text-gray-600 mb-4 text-sm">
            ← Назад
          </button>
          <div className="text-4xl mb-3 text-center">👦</div>
          <h2 className="text-xl font-bold text-center text-gray-800 mb-1">Кто ты?</h2>
          {state.children.length === 0 ? (
            <p className="text-gray-500 text-sm text-center mt-4">Дети ещё не добавлены. Попроси родителя настроить твой профиль!</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mt-5 mb-5">
                {state.children.map(c => (
                  <button key={c.id}
                    onClick={() => { setSelectedChild(c.id); setChildPin(''); setChildPinError(false); }}
                    className={`flex flex-col items-center p-4 rounded-xl border-2 transition ${
                      selectedChild === c.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300'
                    }`}>
                    <span className="text-3xl">{c.avatar}</span>
                    <span className="text-sm font-medium text-gray-700 mt-1">{c.name}</span>
                  </button>
                ))}
              </div>
              {selectedChild && (
                <>
                  <p className="text-gray-500 text-sm text-center mb-2">
                    Введи PIN-код {child?.name}
                  </p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={childPin}
                    onChange={e => { setChildPin(e.target.value); setChildPinError(false); }}
                    onKeyDown={e => e.key === 'Enter' && handleChildLogin()}
                    placeholder="PIN"
                    className={`w-full border-2 rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none transition ${
                      childPinError ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-orange-400'
                    }`}
                    autoFocus
                  />
                  {childPinError && <p className="text-red-500 text-sm text-center mt-2">Неверный PIN-код</p>}
                  <button onClick={handleChildLogin}
                    className="mt-4 w-full bg-orange-400 hover:bg-orange-500 text-white font-semibold py-3 rounded-xl transition">
                    Вперёд!
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4 relative">
      {familyLogin && onSwitchFamily && (
        <div className="absolute top-4 right-4 text-xs text-gray-400 flex items-center gap-1.5">
          <span>Семья: {familyLogin}</span>
          <button onClick={onSwitchFamily} className="underline hover:text-gray-600 transition">сменить</button>
        </div>
      )}
      <div className="w-full max-w-md text-center">
        <div className="text-6xl mb-4">🌟</div>
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Семейные задания</h1>
        <p className="text-gray-500 mb-10">Ежедневные задачи и награды для всей семьи</p>

        <div className="grid gap-4">
          <button onClick={handleParentClick}
            className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl p-6 flex items-center gap-4 transition shadow-md hover:shadow-lg text-left">
            <span className="text-4xl">👨‍👩‍👧‍👦</span>
            <div>
              <div className="font-bold text-lg">Я родитель</div>
              <div className="text-indigo-200 text-sm">Управлять заданиями и наградами</div>
            </div>
          </button>

          <button onClick={() => setShowChildPicker(true)}
            className="bg-orange-400 hover:bg-orange-500 text-white rounded-2xl p-6 flex items-center gap-4 transition shadow-md hover:shadow-lg text-left">
            <span className="text-4xl">⭐</span>
            <div>
              <div className="font-bold text-lg">Я ребёнок</div>
              <div className="text-orange-100 text-sm">Смотреть задания и зарабатывать награды</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
