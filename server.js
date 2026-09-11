import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import {
  ensureDataDirs,
  loadAccounts,
  saveAccounts,
  createAccount,
  findAccountByLogin,
  verifyPassword,
  hashPassword,
  loadFamilyState,
  saveFamilyState,
  DATA_DIR,
} from './store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_FILE = join(DATA_DIR, 'secret.txt');

ensureDataDirs();

// ---------- secret / tokens ----------

function loadOrCreateSecret() {
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(SECRET_FILE, secret);
  return secret;
}
const SESSION_SECRET = loadOrCreateSecret();

function makeToken(familyId) {
  const sig = createHmac('sha256', SESSION_SECRET).update(familyId).digest('hex');
  return `${familyId}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return null;
  const familyId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac('sha256', SESSION_SECRET).update(familyId).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return familyId;
}

// ---------- middleware ----------

app.use(express.json({ limit: '2mb' }));

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const familyId = verifyToken(token);
  if (!familyId) return res.status(401).json({ error: 'unauthorized' });
  const accounts = loadAccounts();
  if (!accounts.some(a => a.id === familyId)) return res.status(401).json({ error: 'unauthorized' });
  req.familyId = familyId;
  next();
}

app.use(express.static(join(__dirname, 'dist')));

// ---------- auth endpoints ----------

app.post('/api/register', (req, res) => {
  const { login, password } = req.body || {};
  if (typeof login !== 'string' || typeof password !== 'string' || !login.trim() || password.length < 4) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  try {
    const account = createAccount(login, password);
    res.json({ token: makeToken(account.id), familyId: account.id, login: account.login });
  } catch (e) {
    if (e.message === 'login_taken') return res.status(409).json({ error: 'login_taken' });
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body || {};
  if (typeof login !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'invalid_input' });
  }
  const account = findAccountByLogin(login);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({ token: makeToken(account.id), familyId: account.id, login: account.login });
});

// ---------- state endpoints (per-family) ----------

app.get('/api/state', requireAuth, (req, res) => {
  res.json(loadFamilyState(req.familyId));
});

app.put('/api/state', requireAuth, (req, res) => {
  try {
    saveFamilyState(req.familyId, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- account (self-service credential change) ----------

// A logged-in family changes its own login and/or password. The familyId
// (and therefore the family's data file and existing token) is never changed,
// so the caller stays logged in and no data migration is needed.
app.put('/api/account', requireAuth, (req, res) => {
  const { currentPassword, newLogin, newPassword } = req.body || {};

  const accounts = loadAccounts();
  const account = accounts.find(a => a.id === req.familyId);
  if (!account) return res.status(401).json({ error: 'unauthorized' });

  if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, account.passwordHash)) {
    return res.status(401).json({ error: 'invalid_password' });
  }

  const wantsLogin = typeof newLogin === 'string' && newLogin.trim() !== '';
  const wantsPassword = typeof newPassword === 'string' && newPassword !== '';
  if (!wantsLogin && !wantsPassword) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  if (wantsPassword && newPassword.length < 4) {
    return res.status(400).json({ error: 'weak_password' });
  }

  if (wantsLogin) {
    const nextLoginLower = newLogin.trim().toLowerCase();
    if (nextLoginLower !== account.loginLower && accounts.some(a => a.loginLower === nextLoginLower)) {
      return res.status(409).json({ error: 'login_taken' });
    }
    account.login = newLogin.trim();
    account.loginLower = nextLoginLower;
  }
  if (wantsPassword) {
    account.passwordHash = hashPassword(newPassword);
  }

  saveAccounts(accounts);
  res.json({ ok: true, login: account.login });
});

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Family Tasks running on http://localhost:${PORT}`);
});
