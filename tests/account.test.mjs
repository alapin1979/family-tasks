// Regression tests for the self-service credential-change endpoint
// (PUT /api/account): a logged-in family changing its own login and/or
// password. Critically verifies that changing credentials keeps the family's
// id, session token, and stored data intact — no re-login, no migration.
//
// Uses only Node's built-in test runner, spinning up server.js as a real
// child process against a throwaway temp data dir (FAMILY_TASKS_DATA_DIR),
// so it never touches the real data/ folder.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function randomPort() {
  return 39000 + Math.floor(Math.random() * 5000);
}

async function waitForServer(baseUrl, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  throw new Error(`Server at ${baseUrl} did not become ready in time`);
}

function startServer(dataDir, port) {
  return spawn(process.execPath, [join(repoRoot, 'server.js')], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), FAMILY_TASKS_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function stopServer(proc) {
  return new Promise(resolve => {
    if (!proc || proc.killed) return resolve();
    proc.once('exit', () => resolve());
    proc.kill('SIGKILL');
  });
}

describe('account credential change (PUT /api/account)', () => {
  let dataDir;
  let port;
  let baseUrl;
  let proc;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'family-tasks-account-test-'));
    port = randomPort();
    baseUrl = `http://localhost:${port}`;
    proc = startServer(dataDir, port);
    await waitForServer(baseUrl);
  });

  after(async () => {
    await stopServer(proc);
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function register(login, password) {
    const res = await fetch(`${baseUrl}/api/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    return { status: res.status, body: await res.json() };
  }

  async function login(loginName, password) {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginName, password }),
    });
    return { status: res.status, body: await res.json() };
  }

  async function putAccount(token, body) {
    const res = await fetch(`${baseUrl}/api/account`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function getState(token) {
    const res = await fetch(`${baseUrl}/api/state`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  async function putState(token, state) {
    const res = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(state),
    });
    return { status: res.status, body: await res.json() };
  }

  test('requires a valid token', async () => {
    const res = await putAccount(null, { currentPassword: 'whatever', newPassword: 'newpass123' });
    assert.equal(res.status, 401);
  });

  test('rejects a wrong current password', async () => {
    const reg = await register('wrongpw-family', 'origPassword1');
    assert.equal(reg.status, 200);
    const res = await putAccount(reg.body.token, { currentPassword: 'notThePassword', newPassword: 'newPassword1' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_password');
    // original password must still work
    const stillWorks = await login('wrongpw-family', 'origPassword1');
    assert.equal(stillWorks.status, 200);
  });

  test('rejects a change that sets neither a new login nor a new password', async () => {
    const reg = await register('noop-family', 'origPassword1');
    const res = await putAccount(reg.body.token, { currentPassword: 'origPassword1' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_input');
  });

  test('rejects a new password shorter than 4 characters', async () => {
    const reg = await register('weakpw-family', 'origPassword1');
    const res = await putAccount(reg.body.token, { currentPassword: 'origPassword1', newPassword: 'abc' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'weak_password');
  });

  test('changes the password: new one works, old one is rejected', async () => {
    const reg = await register('changepw-family', 'origPassword1');
    const res = await putAccount(reg.body.token, { currentPassword: 'origPassword1', newPassword: 'brandNewPass2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const oldFails = await login('changepw-family', 'origPassword1');
    assert.equal(oldFails.status, 401);

    const newWorks = await login('changepw-family', 'brandNewPass2');
    assert.equal(newWorks.status, 200);
    // familyId is stable across a password change
    assert.equal(newWorks.body.familyId, reg.body.familyId);
  });

  test('the existing token stays valid after a password change (no forced re-login)', async () => {
    const reg = await register('token-survives-family', 'origPassword1');
    const before = await getState(reg.body.token);
    assert.equal(before.status, 200);

    const changed = await putAccount(reg.body.token, { currentPassword: 'origPassword1', newPassword: 'anotherPass3' });
    assert.equal(changed.status, 200);

    // same token, still authorized
    const after = await getState(reg.body.token);
    assert.equal(after.status, 200);
  });

  test('changes the login: new login works, familyId and data are preserved', async () => {
    const reg = await register('oldlogin-family', 'origPassword1');
    const familyId = reg.body.familyId;

    // seed some data so we can prove it survives the login change
    const seeded = await putState(reg.body.token, {
      parentPin: '4242',
      children: [{ id: 'kid1', name: 'Мика', avatar: '🐨', pin: '1234' }],
      tasks: [{ id: 't1', title: 'Убрать игрушки' }],
      completions: [], rewards: [], rewardClaims: [], manualPenalties: [], manualAdjustments: [], taskEditLog: [],
    });
    assert.equal(seeded.status, 200);

    const res = await putAccount(reg.body.token, { currentPassword: 'origPassword1', newLogin: 'newlogin-family' });
    assert.equal(res.status, 200);
    assert.equal(res.body.login, 'newlogin-family');

    // new login authenticates and resolves to the SAME familyId
    const newLogin = await login('newlogin-family', 'origPassword1');
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body.familyId, familyId);

    // old login no longer exists
    const oldLogin = await login('oldlogin-family', 'origPassword1');
    assert.equal(oldLogin.status, 401);

    // data is intact and reachable via the original token AND the new login token
    for (const tk of [reg.body.token, newLogin.body.token]) {
      const st = await getState(tk);
      assert.equal(st.status, 200);
      assert.equal(st.body.parentPin, '4242');
      assert.equal(st.body.children[0].name, 'Мика');
      assert.equal(st.body.tasks[0].title, 'Убрать игрушки');
    }
  });

  test('changes login and password together in one request', async () => {
    const reg = await register('combo-old', 'origPassword1');
    const res = await putAccount(reg.body.token, {
      currentPassword: 'origPassword1',
      newLogin: 'combo-new',
      newPassword: 'comboPass9',
    });
    assert.equal(res.status, 200);

    // only the new login + new password combination works
    assert.equal((await login('combo-new', 'comboPass9')).status, 200);
    assert.equal((await login('combo-new', 'origPassword1')).status, 401);
    assert.equal((await login('combo-old', 'comboPass9')).status, 401);
  });

  test('rejects a new login already taken by another family (case-insensitive)', async () => {
    const a = await register('taken-family-a', 'origPassword1');
    await register('Taken-Family-B', 'origPassword1');

    // family A tries to rename itself to B's login in a different case
    const res = await putAccount(a.body.token, { currentPassword: 'origPassword1', newLogin: 'TAKEN-FAMILY-B' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'login_taken');

    // A's original login must still work
    assert.equal((await login('taken-family-a', 'origPassword1')).status, 200);
  });

  test('allows re-saving the same login (case change on own account) without a conflict', async () => {
    const reg = await register('selfcase-family', 'origPassword1');
    const res = await putAccount(reg.body.token, { currentPassword: 'origPassword1', newLogin: 'SelfCase-Family' });
    assert.equal(res.status, 200);
    assert.equal(res.body.login, 'SelfCase-Family');
    // still the same account, still logs in
    const relog = await login('selfcase-family', 'origPassword1');
    assert.equal(relog.status, 200);
    assert.equal(relog.body.familyId, reg.body.familyId);
  });

  test('changes survive a server restart (persisted to accounts.json)', async () => {
    const reg = await register('persist-family', 'origPassword1');
    await putAccount(reg.body.token, { currentPassword: 'origPassword1', newLogin: 'persist-renamed', newPassword: 'persistPass4' });

    await stopServer(proc);
    proc = startServer(dataDir, port);
    await waitForServer(baseUrl);

    assert.equal((await login('persist-renamed', 'persistPass4')).status, 200);
    assert.equal((await login('persist-family', 'origPassword1')).status, 401);

    // sanity: the stored account row reflects the new login and no plaintext password
    const accounts = JSON.parse(readFileSync(join(dataDir, 'accounts.json'), 'utf8'));
    const row = accounts.find(a => a.loginLower === 'persist-renamed');
    assert.ok(row);
    assert.ok(row.passwordHash && !JSON.stringify(row).includes('persistPass4'));
  });
});
