import { useState } from 'react';
import { useApp } from '../../context';

export default function SettingsTab() {
  const { state, setParentPin } = useApp();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function handleChangePin() {
    if (currentPin !== state.parentPin) { setError('Текущий PIN неверен'); return; }
    if (newPin.length < 4) { setError('Новый PIN должен быть не менее 4 цифр'); return; }
    if (newPin !== confirmPin) { setError('PIN-коды не совпадают'); return; }
    setParentPin(newPin);
    setCurrentPin(''); setNewPin(''); setConfirmPin('');
    setError(''); setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-700 mb-4">Изменить PIN родителя</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Текущий PIN</label>
            <input type="password" inputMode="numeric" maxLength={8}
              value={currentPin} onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, '')); setError(''); setSuccess(false); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm tracking-widest" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Новый PIN</label>
            <input type="password" inputMode="numeric" maxLength={8}
              value={newPin} onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm tracking-widest" />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Подтвердите новый PIN</label>
            <input type="password" inputMode="numeric" maxLength={8}
              value={confirmPin} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 text-sm tracking-widest" />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {success && <p className="text-green-600 text-sm mt-2">PIN успешно изменён!</p>}
        <button onClick={handleChangePin}
          className="mt-4 bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition">
          Изменить PIN
        </button>
      </div>
    </div>
  );
}
