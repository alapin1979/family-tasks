import { useState } from 'react';
import { useApp } from '../../context';

const AVATARS = ['👦', '👧', '🧒', '👶', '🐱', '🐶', '🦊', '🐸', '🐼', '🦄', '🐯', '🐻'];

export default function ChildrenTab() {
  const { state, addChild, editChild, removeChild } = useApp();

  // Add form
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [avatar, setAvatar] = useState('👦');
  const [error, setError] = useState('');

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editAvatar, setEditAvatar] = useState('👦');
  const [editError, setEditError] = useState('');

  function handleAdd() {
    if (!name.trim()) { setError('Имя обязательно'); return; }
    if (pin.length < 4) { setError('PIN должен быть не менее 4 цифр'); return; }
    addChild({ name: name.trim(), pin, avatar });
    setName(''); setPin(''); setAvatar('👦'); setError('');
  }

  function openEdit(child: typeof state.children[number]) {
    setEditingId(child.id);
    setEditName(child.name);
    setEditPin(child.pin);
    setEditAvatar(child.avatar);
    setEditError('');
  }

  function saveEdit() {
    if (!editName.trim()) { setEditError('Имя обязательно'); return; }
    if (editPin.length < 4) { setEditError('PIN должен быть не менее 4 цифр'); return; }
    editChild(editingId!, { name: editName.trim(), pin: editPin, avatar: editAvatar });
    setEditingId(null);
  }

  return (
    <div className="space-y-6">
      {/* Add child form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-700 mb-4">Добавить ребёнка</h3>
        <div className="mb-3">
          <label className="text-sm text-gray-500 mb-1 block">Аватар</label>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map(a => (
              <button key={a} onClick={() => setAvatar(a)}
                className={`text-2xl w-10 h-10 rounded-xl transition ${avatar === a ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-gray-100'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Имя</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Имя ребёнка"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">PIN (4+ цифры)</label>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="например, 1234"
              type="password"
              inputMode="numeric"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm tracking-widest" />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <button onClick={handleAdd}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition">
          + Добавить ребёнка
        </button>
      </div>

      {/* Child list */}
      <div className="space-y-3">
        {state.children.length === 0 && (
          <p className="text-gray-400 text-center py-8">Дети ещё не добавлены</p>
        )}
        {state.children.map(child => (
          <div key={child.id} className="bg-white rounded-2xl shadow-sm border border-gray-100">
            {editingId === child.id ? (
              /* Inline edit form */
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-gray-700">Редактировать профиль</h4>
                  <button onClick={() => setEditingId(null)}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                <div className="mb-3">
                  <label className="text-sm text-gray-500 mb-1 block">Аватар</label>
                  <div className="flex flex-wrap gap-2">
                    {AVATARS.map(a => (
                      <button key={a} onClick={() => setEditAvatar(a)}
                        className={`text-2xl w-10 h-10 rounded-xl transition ${editAvatar === a ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-gray-100'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-sm text-gray-500 mb-1 block">Имя</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 mb-1 block">PIN (4+ цифры)</label>
                    <input value={editPin} onChange={e => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      type="password"
                      inputMode="numeric"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm tracking-widest" />
                  </div>
                </div>
                {editError && <p className="text-red-500 text-sm mb-2">{editError}</p>}
                <button onClick={saveEdit}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium transition">
                  Сохранить
                </button>
              </div>
            ) : (
              /* Normal view */
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{child.avatar}</span>
                  <div>
                    <div className="font-semibold text-gray-800">{child.name}</div>
                    <div className="text-xs text-gray-400">PIN: {'•'.repeat(child.pin.length)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(child)}
                    className="text-gray-300 hover:text-indigo-400 transition text-lg px-1"
                    title="Редактировать">✏️</button>
                  <button onClick={() => removeChild(child.id)}
                    className="text-gray-300 hover:text-red-400 transition text-xl"
                    title="Удалить">✕</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
