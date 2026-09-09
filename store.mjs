// Shared data-store layer: the accounts "database" (data/accounts.json) and
// per-family state files (data/families/<id>.json). No family-specific data
// lives in source code — this module only knows how to read/write the store.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Overridable so automated tests (and any future tooling) can point at an
// isolated temp folder instead of the real data/ directory used in dev/prod.
export const DATA_DIR = process.env.FAMILY_TASKS_DATA_DIR
  ? resolve(process.env.FAMILY_TASKS_DATA_DIR)
  : join(__dirname, 'data');
export const FAMILIES_DIR = join(DATA_DIR, 'families');
export const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

export const defaultState = {
  parentPin: '',
  children: [],
  tasks: [],
  completions: [],
  rewards: [],
  rewardClaims: [],
  manualPenalties: [],
  manualAdjustments: [],
  taskEditLog: [],
};

export function ensureDataDirs() {
  mkdirSync(FAMILIES_DIR, { recursive: true });
}

// ---------- passwords ----------

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const testHash = scryptSync(password, salt, 64);
  return hashBuffer.length === testHash.length && timingSafeEqual(hashBuffer, testHash);
}

// ---------- accounts ----------

export function loadAccounts() {
  try {
    if (existsSync(ACCOUNTS_FILE)) return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch {}
  return [];
}

export function saveAccounts(accounts) {
  ensureDataDirs();
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

export function findAccountByLogin(login) {
  const loginLower = String(login).trim().toLowerCase();
  return loadAccounts().find(a => a.loginLower === loginLower);
}

export function createAccount(login, password) {
  const loginLower = String(login).trim().toLowerCase();
  const accounts = loadAccounts();
  if (accounts.some(a => a.loginLower === loginLower)) {
    throw new Error('login_taken');
  }
  const familyId = randomBytes(8).toString('hex');
  const account = { id: familyId, login: String(login).trim(), loginLower, passwordHash: hashPassword(password) };
  accounts.push(account);
  saveAccounts(accounts);
  saveFamilyState(familyId, { ...defaultState });
  return account;
}

// ---------- per-family state ----------

function familyFile(familyId) {
  return join(FAMILIES_DIR, `${familyId}.json`);
}

export function loadFamilyState(familyId) {
  try {
    const file = familyFile(familyId);
    if (existsSync(file)) return { ...defaultState, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {}
  return { ...defaultState };
}

export function saveFamilyState(familyId, state) {
  ensureDataDirs();
  writeFileSync(familyFile(familyId), JSON.stringify(state, null, 2));
}
