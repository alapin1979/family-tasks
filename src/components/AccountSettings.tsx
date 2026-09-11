import { useState } from 'react';
import { getFamilyToken, saveFamilySession } from '../context';

interface Props {
  currentLogin: string;
  onBack: () => void;
  onLoginChanged: (login: string) => void;
}

export default function AccountSettings({ currentLogin, onBack, onLoginChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newLogin, setNewLogin] = useState(currentLogin);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Введите текущий пароль');
      return;
    }
    const loginChanged = newLogin.trim() !== '' && newLogin.trim() !== currentLogin;
    const passwordChanged = newPassword !== '';
    if (!loginChanged && !passwordChanged) {
      setError('Измените логин или пароль');
      return;
    }
    if (passwordChanged) {
      if (newPassword.length < 4) {
        setError('Новый пароль должен быть не менее 4 символов');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
    }

    const token = getFamilyToken();
    if (!token) {
      setError('Сессия истекла. Войдите заново.');
      return;
    }

    setBusy(true);
    try {
      const body: { currentPassword: string; newLogin?: string; newPassword?: string } = { currentPassword };
      if (loginChanged) body.newLogin = newLogin.trim();
      if (passwordChanged) body.newPassword = newPassword;

      const res = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'invalid_password') setError('Неверный текущий пароль');
        else if (data.error === 'login_taken') setError('Такой логин уже занят');
        else if (data.error === 'weak_password') setError('Новый пароль должен быть не менее 4 символов');
        else if (data.error === 'invalid_input') setError('Измените логин или пароль');
        else setError('Не удалось сохранить. Попробуйте ещё раз.');
        setBusy(false);
        return;
      }

      const savedLogin = data.login ?? newLogin.trim();
      saveFamilySession(token, savedLogin);
      onLoginChanged(savedLogin);
      setSuccess('Изменения сохранены');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setBusy(false);
    } catch {
      setError('Ошибка соединения с сервером');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 mb-4 text-sm">
          ← Назад
        </button>
        <div className="text-4xl mb-3 text-center">⚙️</div>
        <h2 className="text-xl font-bold text-center text-gray-800 mb-1">Настройки семьи</h2>
        <p className="text-gray-500 text-sm text-center mb-6">Измените логин или пароль вашей семьи</p>

        <div className="space-y-3">
          <input
            type="password"
            value={currentPassword}
            onChange={e => { setCurrentPassword(e.target.value); setError(''); }}
            placeholder="Текущий пароль"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
            autoFocus
          />
          <input
            value={newLogin}
            onChange={e => { setNewLogin(e.target.value); setError(''); }}
            placeholder="Новый логин"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
          />
          <input
            type="password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setError(''); }}
            placeholder="Новый пароль (не меняется, если пусто)"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
          />
          {newPassword !== '' && (
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Повторите новый пароль"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
            />
          )}
        </div>

        {error && <p className="text-red-500 text-sm text-center mt-3">{error}</p>}
        {success && <p className="text-green-600 text-sm text-center mt-3">{success}</p>}

        <button onClick={handleSubmit} disabled={busy}
          className="mt-5 w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
          {busy ? '...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
