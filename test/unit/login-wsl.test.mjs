import { describe, it, expect, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureStorageState, WSL_LAUNCH_ARGS } from '../../src/adapters/login.mjs';

const fakeBrowser = () => {
  const handlers = { context: [], browser: [] };
  const ctx = {
    newPage: async () => ({
      mainFrame: () => ({}),
      on: () => {},
      goto: async () => {},
    }),
    storageState: async () => ({ cookies: [{ name: 'sid', value: 'x' }], origins: [] }),
    on: (ev, fn) => handlers.context.push({ ev, fn }),
  };
  return {
    handlers,
    browser: {
      newContext: async () => ctx,
      close: async () => {},
      on: (ev, fn) => handlers.browser.push({ ev, fn }),
    },
    triggerSigint: () => {
      // simulate SIGINT — runs the handler installed via process.once('SIGINT', ...)
      const sigintListeners = process.listeners('SIGINT');
      sigintListeners[sigintListeners.length - 1]();
    },
  };
};

const fakeLauncher = (calls) => ({
  launch: async (opts) => {
    calls.push(opts);
    const fb = fakeBrowser();
    fb.calls = calls;
    return fb.browser;
  },
});

const adapterFor = async (name) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'crucible-wsl-'));
  return {
    name,
    url: 'https://example.com',
    authStrategy: 'cookie-handoff',
    storageStatePath: path.join(root, `${name}.json`),
  };
};

const runWithSigint = async (promise) => {
  // Give the SIGINT handler a tick to register, then fire it.
  await new Promise((r) => setImmediate(r));
  process.emit('SIGINT');
  return promise;
};

describe('captureStorageState — WSL launch flags', () => {
  it('passes --disable-gpu et al when isWSL() returns true', async () => {
    const calls = [];
    const launcher = fakeLauncher(calls);
    const adapter = await adapterFor('wsl-target');
    const log = vi.fn();
    const promise = captureStorageState({
      adapter,
      isWSL: async () => true,
      launcher,
      log,
    });
    await runWithSigint(promise);

    expect(calls).toHaveLength(1);
    expect(calls[0].headless).toBe(false);
    expect(calls[0].args).toEqual([...WSL_LAUNCH_ARGS]);
    expect(log.mock.calls.flat().join('\n')).toMatch(/detected WSL/);
  });

  it('does NOT pass extra args on non-WSL hosts', async () => {
    const calls = [];
    const launcher = fakeLauncher(calls);
    const adapter = await adapterFor('mac-target');
    const log = vi.fn();
    const promise = captureStorageState({
      adapter,
      isWSL: async () => false,
      launcher,
      log,
    });
    await runWithSigint(promise);

    expect(calls).toHaveLength(1);
    expect(calls[0].headless).toBe(false);
    expect(calls[0].args).toBeUndefined();
    expect(log.mock.calls.flat().join('\n')).not.toMatch(/detected WSL/);
  });

  it('exposes a frozen WSL_LAUNCH_ARGS list (no accidental mutation)', () => {
    expect(Object.isFrozen(WSL_LAUNCH_ARGS)).toBe(true);
    expect(WSL_LAUNCH_ARGS).toContain('--disable-gpu');
    expect(WSL_LAUNCH_ARGS).toContain('--disable-software-rasterizer');
    expect(WSL_LAUNCH_ARGS).toContain('--disable-dev-shm-usage');
    expect(WSL_LAUNCH_ARGS).toContain('--no-sandbox');
  });
});
