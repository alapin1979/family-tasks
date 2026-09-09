// Unit tests for the store.mjs data layer, run in-process (no server).
// Each test file that touches FAMILY_TASKS_DATA_DIR sets it before importing
// store.mjs (with a cache-busting query string, since the module reads the
// env var once at top-level) so it never touches the real data/ directory.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('store.mjs (unit)', () => {
  let dataDir;
  let store;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'family-tasks-store-unit-'));
    process.env.FAMILY_TASKS_DATA_DIR = dataDir;
    store = await import(`../store.mjs?bust=${Date.now()}`);
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.FAMILY_TASKS_DATA_DIR;
  });

  test('hashPassword salts each hash differently, but both verify correctly', () => {
    const h1 = store.hashPassword('secret123');
    const h2 = store.hashPassword('secret123');
    assert.notEqual(h1, h2, 'same password should produce different hashes (random salt per hash)');
    assert.ok(store.verifyPassword('secret123', h1));
    assert.ok(store.verifyPassword('secret123', h2));
  });

  test('verifyPassword rejects a wrong password', () => {
    const hash = store.hashPassword('correct-password');
    assert.equal(store.verifyPassword('wrong-password', hash), false);
  });

  test('verifyPassword returns false (never throws) for a malformed stored value', () => {
    assert.equal(store.verifyPassword('anything', 'not-a-valid-hash'), false);
    assert.equal(store.verifyPassword('anything', ''), false);
    assert.equal(store.verifyPassword('anything', undefined), false);
  });

  test('loadFamilyState returns full defaults for an unknown family id', () => {
    const state = store.loadFamilyState('does-not-exist');
    assert.equal(state.parentPin, '');
    assert.deepEqual(state.children, []);
    assert.deepEqual(state.tasks, []);
  });

  test('saveFamilyState + loadFamilyState round-trips saved fields', () => {
    store.saveFamilyState('fam1', {
      parentPin: '4444',
      children: [{ id: 'c1', name: 'Kid', avatar: '🐱', pin: '1234' }],
    });
    const state = store.loadFamilyState('fam1');
    assert.equal(state.parentPin, '4444');
    assert.equal(state.children[0].name, 'Kid');
  });

  test('loadFamilyState fills in fields missing from a saved (older-schema) file with defaults', () => {
    // simulates a family file saved before manualAdjustments/taskEditLog existed
    store.saveFamilyState('fam-old-schema', { parentPin: '1234', children: [] });
    const state = store.loadFamilyState('fam-old-schema');
    assert.deepEqual(state.manualAdjustments, []);
    assert.deepEqual(state.taskEditLog, []);
    assert.deepEqual(state.rewards, []);
  });

  test('createAccount rejects a duplicate login, case-insensitively', () => {
    store.createAccount('uniquefamily', 'password123');
    assert.throws(() => store.createAccount('UniqueFamily', 'anotherpassword'), /login_taken/);
  });

  test('createAccount gives each family a distinct id and its own default state file', () => {
    const a = store.createAccount('famX', 'password123');
    const b = store.createAccount('famY', 'password123');
    assert.notEqual(a.id, b.id);
    assert.equal(store.loadFamilyState(a.id).parentPin, '');
    assert.equal(store.loadFamilyState(b.id).parentPin, '');
  });

  test('findAccountByLogin is case-insensitive and trims whitespace', () => {
    store.createAccount('trimtest', 'password123');
    const found = store.findAccountByLogin('  TrimTest  ');
    assert.ok(found, 'should find the account despite case/whitespace differences');
    assert.equal(found.login, 'trimtest');
  });

  test('findAccountByLogin returns undefined for a login that was never created', () => {
    assert.equal(store.findAccountByLogin('totally-unknown-family'), undefined);
  });
});
