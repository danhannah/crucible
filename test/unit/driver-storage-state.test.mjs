import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const newContextSpy = vi.fn(async () => ({
  newPage: async () => ({
    goto: async () => ({ status: () => 200 }),
    url: () => 'about:blank',
    screenshot: async () => Buffer.from([]),
    viewportSize: () => ({ width: 1280, height: 800 }),
    evaluate: async () => null,
    click: async () => undefined,
    close: async () => undefined,
  }),
  close: async () => undefined,
}));

const launchSpy = vi.fn(async () => ({
  newContext: newContextSpy,
  close: async () => undefined,
}));

vi.mock('playwright', () => ({
  chromium: { launch: launchSpy },
}));

const { createPlaywrightDriver } = await import('../../src/driver/playwright.mjs');

let tmpRoot;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'crucible-driver-'));
  newContextSpy.mockClear();
  launchSpy.mockClear();
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

describe('Playwright driver — storageState wiring', () => {
  it('loads parsed storage state when the file exists', async () => {
    const file = path.join(tmpRoot, 'authed.json');
    const fakeState = { cookies: [{ name: 'sid', value: 'abc' }], origins: [] };
    await writeFile(file, JSON.stringify(fakeState));

    const driver = createPlaywrightDriver({ storageStatePath: file });
    await driver.navigate('http://example.com');

    expect(newContextSpy).toHaveBeenCalledTimes(1);
    const [opts] = newContextSpy.mock.calls[0];
    expect(opts.storageState).toEqual(fakeState);
    await driver.close();
  });

  it('starts unauthenticated when the storage state file is missing', async () => {
    const file = path.join(tmpRoot, 'does-not-exist.json');

    const driver = createPlaywrightDriver({ storageStatePath: file });
    await driver.navigate('http://example.com');

    expect(newContextSpy).toHaveBeenCalledTimes(1);
    const [opts] = newContextSpy.mock.calls[0];
    expect(opts.storageState).toBeUndefined();
    await driver.close();
  });

  it('throws a wrapped error when the storage state file is corrupt JSON', async () => {
    const file = path.join(tmpRoot, 'corrupt.json');
    await writeFile(file, '{not valid json');

    const driver = createPlaywrightDriver({ storageStatePath: file });
    await expect(driver.navigate('http://example.com')).rejects.toThrow(
      /storage state at .* is corrupt.*re-run `crucible login`/s,
    );
    await driver.close();
  });
});

describe('writeStorageState file mode', () => {
  it('writes with mode 0600 and creates parent dir as 0700', async () => {
    const { writeStorageState } = await import('../../src/adapters/storage-state.mjs');
    const dir = path.join(tmpRoot, 'state-perms');
    const file = path.join(dir, 'app.json');
    await writeStorageState(file, { cookies: [], origins: [] });

    const { stat } = await import('node:fs/promises');
    const fileStat = await stat(file);
    const dirStat = await stat(dir);
    // mode & 0o777 isolates permission bits from file-type bits
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it('preserves restrictive perms on rewrite', async () => {
    const { writeStorageState } = await import('../../src/adapters/storage-state.mjs');
    const file = path.join(tmpRoot, 'rewrite.json');
    await writeStorageState(file, { v: 1 });
    await chmod(file, 0o600); // sanity baseline
    await writeStorageState(file, { v: 2 });
    const { stat } = await import('node:fs/promises');
    const fileStat = await stat(file);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});
