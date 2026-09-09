import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import {
  ensureDataDirs,
  loadAccounts,
  createAccount,
  findAccountByLogin,
  verifyPassword,
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

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Family Tasks running on http://localhost:${PORT}`);
});
