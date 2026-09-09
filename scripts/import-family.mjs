#!/usr/bin/env node
// One-time, explicit import of a pre-multi-family state.json into the
// accounts database as a new family, under a login/password you choose.
// Run manually — this is NOT wired into server startup, so no family's
// login ever lives as a literal in the application source.
//
// Usage:
//   node scripts/import-family.mjs <login> <password> [path-to-state.json]
//
// Example (the family that already existed before multi-family support):
//   node scripts/import-family.mjs kovankina kovankina
//
// The source state.json is only ever read here — never modified or deleted.

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadAccounts, saveAccounts, saveFamilyState, hashPassword, defaultState } from '../store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const [login, password, legacyPathArg] = process.argv.slice(2);

if (!login || !password) {
  console.error('Usage: node scripts/import-family.mjs <login> <password> [path-to-state.json]');
  process.exit(1);
}
if (password.length < 4) {
  console.error('Password must be at least 4 characters.');
  process.exit(1);
}

const legacyPath = resolve(legacyPathArg ?? join(repoRoot, 'state.json'));

if (!existsSync(legacyPath)) {
  console.error(`No file found at ${legacyPath}. Nothing imported.`);
  process.exit(1);
}

const loginLower = login.trim().toLowerCase();
const accounts = loadAccounts();
if (accounts.some(a => a.loginLower === loginLower)) {
  console.error(`Login "${login}" already exists. Nothing imported. Pick a different login, or delete the existing account first if this was a mistake.`);
  process.exit(1);
}

let legacy;
try {
  legacy = JSON.parse(readFileSync(legacyPath, 'utf8'));
} catch (e) {
  console.error(`Failed to parse ${legacyPath}:`, e.message);
  process.exit(1);
}

const familyId = login.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || `family-${Date.now()}`;
saveFamilyState(familyId, { ...defaultState, ...legacy });
accounts.push({
  id: familyId,
  login: login.trim(),
  loginLower,
  passwordHash: hashPassword(password),
});
saveAccounts(accounts);

console.log(`Imported ${legacyPath} as family "${familyId}".`);
console.log(`Login: ${login.trim()}`);
console.log('The original file was left untouched — nothing was deleted or modified.');
