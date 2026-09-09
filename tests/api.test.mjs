// Basic regression tests for the multi-family server: registration, login,
// per-family data isolation, persistence across a restart, and the
// standalone legacy-import script. Uses only Node's built-in test runner —
// no extra dependencies. Run with: npm test
//
// Each test spins up server.js as a real child process against a throwaway
// temp data directory (via FAMILY_TASKS_DATA_DIR), so it never touches the
// real data/ folder used by the actual app.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function randomPort() {
  return 34000 + Math.floor(Math.random() * 5000);
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
  const proc = spawn(process.execPath, [join(repoRoot, 'server.js')], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), FAMILY_TASKS_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return proc;
}

function stopServer(proc) {
  return new Promise(resolve => {
    if (!proc || proc.killed) return resolve();
    proc.once('exit', () => resolve());
    proc.kill('SIGKILL');
  });
}

describe('multi-family server', () => {
  let dataDir;
  let port;
  let baseUrl;
  let proc;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'family-tasks-test-'));
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

  async function getState(token) {
    const res = await fetch(`${baseUrl}/api/state`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: res.status === 200 ? await res.json() : await res.json().catch(() => null) };
  }

  async function putState(token, state) {
    const res = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(state),
    });
    return { status: res.status, body: await res.json() };
  }

  let tokenA, familyIdA, tokenB, familyIdB;

  test('registers two distinct families', async () => {
    const a = await register('familyA', 'passwordA123');
    assert.equal(a.status, 200);
    assert.ok(a.body.token);
    assert.ok(a.body.familyId);
    tokenA = a.body.token;
    familyIdA = a.body.familyId;

    const b = await register('familyB', 'passwordB123');
    assert.equal(b.status, 200);
    tokenB = b.body.token;
    familyIdB = b.body.familyId;

    assert.notEqual(familyIdA, familyIdB);
  });

  test('rejects duplicate login on registration', async () => {
    const dup = await register('familyA', 'someOtherPassword');
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'login_taken');
  });

  test('rejects registration with a short password', async () => {
    const res = await register('shortpw', 'abc');
    assert.equal(res.status, 400);
  });

  test('login fails with wrong password', async () => {
    const res = await login('familyA', 'wrongPassword');
    assert.equal(res.status, 401);
  });

  test('login fails for unknown login', async () => {
    const res = await login('nope', 'whatever123');
    assert.equal(res.status, 401);
  });

  test('login succeeds with correct credentials and is case-insensitive on login', async () => {
    const res = await login('FAMILYA', 'passwordA123');
    assert.equal(res.status, 200);
    assert.equal(res.body.familyId, familyIdA);
  });

  test('new family starts with an empty parent PIN and no children', async () => {
    const { status, body } = await getState(tokenA);
    assert.equal(status, 200);
    assert.equal(body.parentPin, '');
    assert.deepEqual(body.children, []);
  });

  test('state endpoint requires a valid token', async () => {
    const noToken = await getState(null);
    assert.equal(noToken.status, 401);

    const badToken = await getState('garbage.notarealtoken');
    assert.equal(badToken.status, 401);

    const tamperedToken = await getState(tokenA.slice(0, -1) + (tokenA.at(-1) === 'a' ? 'b' : 'a'));
    assert.equal(tamperedToken.status, 401);
  });

  test('writes to family A do not leak into family B', async () => {
    const putA = await putState(tokenA, {
      parentPin: '1111',
      children: [{ id: 'c1', name: 'Alice', avatar: '👧', pin: '9999' }],
      tasks: [], completions: [], rewards: [], rewardClaims: [], manualPenalties: [], manualAdjustments: [], taskEditLog: [],
    });
    assert.equal(putA.status, 200);

    const putB = await putState(tokenB, {
      parentPin: '2222',
      children: [{ id: 'c2', name: 'Bob', avatar: '👦', pin: '8888' }],
      tasks: [], completions: [], rewards: [], rewardClaims: [], manualPenalties: [], manualAdjustments: [], taskEditLog: [],
    });
    assert.equal(putB.status, 200);

    const stateA = await getState(tokenA);
    const stateB = await getState(tokenB);

    assert.equal(stateA.body.parentPin, '1111');
    assert.equal(stateA.body.children[0].name, 'Alice');

    assert.equal(stateB.body.parentPin, '2222');
    assert.equal(stateB.body.children[0].name, 'Bob');

    // cross-check: A's data never appears in B and vice versa
    assert.notEqual(stateA.body.parentPin, stateB.body.parentPin);
    assert.notEqual(stateA.body.children[0].name, stateB.body.children[0].name);
  });

  test('data persists across a server restart', async () => {
    await stopServer(proc);
    proc = startServer(dataDir, port);
    await waitForServer(baseUrl);

    const stateA = await getState(tokenA);
    assert.equal(stateA.status, 200);
    assert.equal(stateA.body.parentPin, '1111');
    assert.equal(stateA.body.children[0].name, 'Alice');

    // token itself must also still work after restart (HMAC survives via secret.txt)
    const stateB = await getState(tokenB);
    assert.equal(stateB.status, 200);
    assert.equal(stateB.body.parentPin, '2222');
  });

  test('register rejects missing login or password', async () => {
    const noPassword = await register('someLogin', undefined);
    assert.equal(noPassword.status, 400);

    const noLogin = await register(undefined, 'somePassword123');
    assert.equal(noLogin.status, 400);

    const empty = await register('', '');
    assert.equal(empty.status, 400);
  });

  test('login rejects missing login or password', async () => {
    const res1 = await login(undefined, 'whatever');
    assert.equal(res1.status, 400);
    const res2 = await login('familyA', undefined);
    assert.equal(res2.status, 400);
  });

  test('a syntactically valid token signed for a family id that was never created is rejected', async () => {
    // read the server's real HMAC secret straight off disk (test has filesystem
    // access to the temp data dir) and forge a token for an id that doesn't exist
    // in accounts.json — this checks requireAuth verifies account existence, not
    // just the signature.
    const secret = readFileSync(join(dataDir, 'secret.txt'), 'utf8').trim();
    const fakeFamilyId = 'totally-fake-family-id';
    const sig = createHmac('sha256', secret).update(fakeFamilyId).digest('hex');
    const forgedToken = `${fakeFamilyId}.${sig}`;

    const res = await getState(forgedToken);
    assert.equal(res.status, 401);
  });

  test('unknown routes fall back to serving the SPA (client-side routing support)', async (t) => {
    const distIndex = join(repoRoot, 'dist', 'index.html');
    if (!existsSync(distIndex)) {
      t.skip('dist/ not built — run `npm run build` first to exercise this path');
      return;
    }
    const res = await fetch(`${baseUrl}/some/random/client/route`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /id="root"/);
  });
});

describe('legacy family import script', () => {
  let dataDir;

  before(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'family-tasks-import-test-'));
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function runImport(args) {
    return new Promise(resolve => {
      const proc = spawn(process.execPath, [join(repoRoot, 'scripts', 'import-family.mjs'), ...args], {
        cwd: repoRoot,
        env: { ...process.env, FAMILY_TASKS_DATA_DIR: dataDir },
      });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('exit', code => resolve({ code, stdout, stderr }));
    });
  }

  test('refuses to import when the legacy file does not exist', async () => {
    const result = await runImport(['nofile', 'password123', join(dataDir, 'missing.json')]);
    assert.notEqual(result.code, 0);
  });

  test('imports a legacy state.json into a new family, without modifying the original file', async () => {
    const legacyPath = join(dataDir, 'legacy-state.json');
    const legacyContent = {
      parentPin: '5555',
      children: [{ id: 'x1', name: 'Vasya', avatar: '🐱', pin: '1111' }],
      tasks: [], completions: [], rewards: [], rewardClaims: [], manualPenalties: [], manualAdjustments: [], taskEditLog: [],
    };
    writeFileSync(legacyPath, JSON.stringify(legacyContent, null, 2));

    const result = await runImport(['kovankina', 'kovankina', legacyPath]);
    assert.equal(result.code, 0);

    // original file must be untouched
    const stillThere = JSON.parse(readFileSync(legacyPath, 'utf8'));
    assert.deepEqual(stillThere, legacyContent);

    const accounts = JSON.parse(readFileSync(join(dataDir, 'accounts.json'), 'utf8'));
    const account = accounts.find(a => a.loginLower === 'kovankina');
    assert.ok(account, 'account should have been created');

    const familyState = JSON.parse(readFileSync(join(dataDir, 'families', `${account.id}.json`), 'utf8'));
    assert.equal(familyState.parentPin, '5555');
    assert.equal(familyState.children[0].name, 'Vasya');
  });

  test('refuses to import twice under the same login', async () => {
    const legacyPath = join(dataDir, 'legacy-state.json'); // already imported above
    const result = await runImport(['kovankina', 'kovankina', legacyPath]);
    assert.notEqual(result.code, 0);
  });

  test('refuses to run with missing login/password arguments', async () => {
    const result = await runImport([]);
    assert.notEqual(result.code, 0);
  });

  test('refuses a password shorter than 4 characters', async () => {
    const legacyPath = join(dataDir, 'legacy-state-2.json');
    writeFileSync(legacyPath, JSON.stringify({ parentPin: '1234', children: [] }));
    const result = await runImport(['shortpwfamily', 'abc', legacyPath]);
    assert.notEqual(result.code, 0);

    const accounts = JSON.parse(readFileSync(join(dataDir, 'accounts.json'), 'utf8'));
    assert.ok(!accounts.some(a => a.loginLower === 'shortpwfamily'), 'no account should have been created');
  });

  test('sanitizes an unusual login into a safe family id', async () => {
    const legacyPath = join(dataDir, 'legacy-state-3.json');
    writeFileSync(legacyPath, JSON.stringify({ parentPin: '7777', children: [] }));
    const result = await runImport(['The Smith Family!', 'password123', legacyPath]);
    assert.equal(result.code, 0);

    const accounts = JSON.parse(readFileSync(join(dataDir, 'accounts.json'), 'utf8'));
    const account = accounts.find(a => a.loginLower === 'the smith family!');
    assert.ok(account, 'account should exist with the original login preserved');
    assert.equal(account.login, 'The Smith Family!');
    // the derived family id (used as a filename) must contain no spaces, punctuation, or uppercase
    assert.match(account.id, /^[a-z0-9_-]+$/);

    const familyState = JSON.parse(readFileSync(join(dataDir, 'families', `${account.id}.json`), 'utf8'));
    assert.equal(familyState.parentPin, '7777');
  });
});
