import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  storageStatePathFor,
  storageStateExists,
  readStorageState,
  writeStorageState,
  deleteStorageState,
  DEFAULT_STORAGE_STATE_ROOT,
} from '../../src/adapters/storage-state.mjs';
import { defineAdapter, resolveAdapter, clearAdapters } from '../../src/adapters/index.mjs';

let tmpRoot;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'crucible-state-'));
  clearAdapters();
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

describe('storageStatePathFor', () => {
  it('produces ~/.crucible/state/<name>.json by default', () => {
    const p = storageStatePathFor('my-app');
    expect(p).toBe(path.join(DEFAULT_STORAGE_STATE_ROOT, 'my-app.json'));
  });

  it('honors a custom root', () => {
    const p = storageStatePathFor('foo', { root: '/tmp/x' });
    expect(p).toBe('/tmp/x/foo.json');
  });

  it('rejects path-traversal-y names', () => {
    expect(() => storageStatePathFor('../etc/passwd')).toThrow();
    expect(() => storageStatePathFor('a/b')).toThrow();
    expect(() => storageStatePathFor('')).toThrow();
  });
});

describe('storage-state CRUD', () => {
  it('writes, reads, exists, and deletes', async () => {
    const file = storageStatePathFor('test', { root: tmpRoot });
    expect(await storageStateExists(file)).toBe(false);

    await writeStorageState(file, { cookies: [{ name: 'sid', value: 'abc' }], origins: [] });
    expect(await storageStateExists(file)).toBe(true);

    const state = await readStorageState(file);
    expect(state.cookies[0].name).toBe('sid');

    expect(await deleteStorageState(file)).toBe(true);
    expect(await storageStateExists(file)).toBe(false);
    expect(await deleteStorageState(file)).toBe(false); // idempotent
  });
});

describe('resolveAdapter auto-populates storageStatePath for cookie-handoff', () => {
  it('does not set storageStatePath for auth=none', () => {
    defineAdapter({
      name: 'noauth',
      createAdapter: ({ url }) => ({ name: 'noauth', url: url || 'http://x', authStrategy: 'none' }),
    });
    const a = resolveAdapter('noauth');
    expect(a.storageStatePath).toBeUndefined();
  });

  it('sets storageStatePath when authStrategy is cookie-handoff', () => {
    defineAdapter({
      name: 'authed',
      createAdapter: ({ url }) => ({ name: 'authed', url: url || 'http://x', authStrategy: 'cookie-handoff' }),
    });
    const a = resolveAdapter('authed', { storageStateRoot: tmpRoot });
    expect(a.storageStatePath).toBe(path.join(tmpRoot, 'authed.json'));
  });

  it('respects an adapter-supplied storageStatePath override', () => {
    defineAdapter({
      name: 'custom-path',
      createAdapter: ({ url }) => ({
        name: 'custom-path',
        url: url || 'http://x',
        authStrategy: 'cookie-handoff',
        storageStatePath: '/explicit/path.json',
      }),
    });
    const a = resolveAdapter('custom-path', { storageStateRoot: tmpRoot });
    expect(a.storageStatePath).toBe('/explicit/path.json');
  });
});
