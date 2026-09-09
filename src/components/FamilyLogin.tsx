import { useState } from 'react';
import { saveFamilySession } from '../context';

interface Props {
  onAuthed: () => void;
}

export default function FamilyLogin({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError('');
    if (!login.trim() || !password) {
      setError('Заполните логин и пароль');
      return;
    }
    if (mode === 'register') {
      if (password.length < 4) {
        setError('Пароль должен быть не менее 4 символов');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'login_taken') setError('Такой логин уже занят');
        else if (data.error === 'invalid_credentials') setError('Неверный логин или пароль');
        else setError('Не удалось выполнить вход. Попробуйте ещё раз.');
        setBusy(false);
        return;
      }
      saveFamilySession(data.token, data.login ?? login.trim());
      onAuthed();
    } catch {
      setError('Ошибка соединения с сервером');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-4xl mb-3 text-center">🏠</div>
        <h2 className="text-xl font-bold text-center text-gray-800 mb-1">
          {mode === 'login' ? 'Вход для семьи' : 'Новая семья'}
        </h2>
        <p className="text-gray-500 text-sm text-center mb-6">
          {mode === 'login'
            ? 'Введите логин и пароль вашей семьи'
            : 'Придумайте логин и пароль для вашей семьи'}
        </p>

        <div className="space-y-3">
          <input
            value={login}
            onChange={e => { setLogin(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Логин семьи"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Пароль"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
          />
          {mode === 'register' && (
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Повторите пароль"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition"
            />
          )}
        </div>

        {error && <p className="text-red-500 text-sm text-center mt-3">{error}</p>}

        <button onClick={handleSubmit} disabled={busy}
          className="mt-5 w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
          {busy ? '...' : mode === 'login' ? 'Войти' : 'Создать семью'}
        </button>

        <button
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); setPassword(''); setConfirmPassword(''); }}
          className="mt-4 w-full text-indigo-500 hover:text-indigo-700 text-sm text-center transition">
          {mode === 'login' ? 'Впервые здесь? Создать семью' : 'Уже есть семья? Войти'}
        </button>
      </div>
    </div>
  );
}
