import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  defineAdapter,
  resolveAdapter,
  listAdapters,
  clearAdapters,
  loadAdaptersFromConfig,
} from '../../src/adapters/index.mjs';
import { resolveConfig, DEFAULT_TEST_ENV_URL } from '../../src/config.mjs';

beforeEach(() => {
  clearAdapters();
});

describe('built-in adapters', () => {
  it('only foundry is registered by default', () => {
    expect(listAdapters()).toEqual(['foundry']);
  });

  it('foundry adapter defaults to local test-env URL', () => {
    const a = resolveAdapter('foundry');
    expect(a.name).toBe('foundry');
    expect(a.url).toBe(DEFAULT_TEST_ENV_URL);
    expect(a.authStrategy).toBe('none');
  });

  it('foundry adapter accepts URL override', () => {
    const a = resolveAdapter('foundry', { url: 'https://foundry.example.com' });
    expect(a.url).toBe('https://foundry.example.com');
  });

  it('unknown adapter throws with helpful message', () => {
    expect(() => resolveAdapter('nope')).toThrow(/unknown adapter "nope"/);
    expect(() => resolveAdapter('nope')).toThrow(/crucible\.config\.mjs|defineAdapter/);
  });
});

describe('defineAdapter()', () => {
  it('registers a consumer-supplied adapter', () => {
    defineAdapter({
      name: 'my-app',
      createAdapter: ({ url }) => ({ name: 'my-app', url, authStrategy: 'none' }),
    });
    expect(listAdapters().sort()).toEqual(['foundry', 'my-app']);
    const a = resolveAdapter('my-app', { url: 'https://my-app.example.com' });
    expect(a.url).toBe('https://my-app.example.com');
  });

  it('rejects malformed definitions', () => {
    expect(() => defineAdapter(null)).toThrow();
    expect(() => defineAdapter({ name: 'x' })).toThrow();
    expect(() => defineAdapter({ createAdapter: () => ({}) })).toThrow();
  });

  it('lets consumers throw their own validation errors', () => {
    defineAdapter({
      name: 'needs-url',
      createAdapter: ({ url }) => {
        if (!url) throw new Error('CRUCIBLE_NEEDS_URL_URL is required');
        return { name: 'needs-url', url, authStrategy: 'cookie-handoff' };
      },
    });
    expect(() => resolveAdapter('needs-url')).toThrow(/CRUCIBLE_NEEDS_URL_URL/);
  });
});

describe('loadAdaptersFromConfig()', () => {
  let tmpDir;

  afterAll(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no config file exists', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'crucible-adapters-'));
    const result = await loadAdaptersFromConfig({ cwd: tmpDir });
    expect(result).toBeNull();
    expect(listAdapters()).toEqual(['foundry']);
  });

  it('imports default-exported adapter array from crucible.config.mjs', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'crucible-adapters-'));
    await writeFile(
      path.join(tmpDir, 'crucible.config.mjs'),
      `export default [
        {
          name: 'consumer-a',
          createAdapter: ({ url }) => ({ name: 'consumer-a', url: url || 'https://a.example.com', authStrategy: 'none' }),
        },
      ];`,
    );
    const result = await loadAdaptersFromConfig({ cwd: tmpDir });
    expect(result).toMatch(/crucible\.config\.mjs$/);
    expect(listAdapters().sort()).toEqual(['consumer-a', 'foundry']);
    const a = resolveAdapter('consumer-a');
    expect(a.url).toBe('https://a.example.com');
  });
});

describe('resolveConfig', () => {
  it('defaults to foundry adapter and legacy CRUCIBLE_TEST_ENV_URL', () => {
    const cfg = resolveConfig({ CRUCIBLE_TEST_ENV_URL: 'http://legacy:1234' });
    expect(cfg.adapter.name).toBe('foundry');
    expect(cfg.adapter.url).toBe('http://legacy:1234');
    expect(cfg.testEnvUrl).toBe('http://legacy:1234');
  });

  it('CRUCIBLE_FOUNDRY_URL overrides legacy CRUCIBLE_TEST_ENV_URL', () => {
    const cfg = resolveConfig({
      CRUCIBLE_FOUNDRY_URL: 'http://new:9999',
      CRUCIBLE_TEST_ENV_URL: 'http://legacy:1234',
    });
    expect(cfg.adapter.url).toBe('http://new:9999');
  });

  it('treats empty-string env vars as unset', () => {
    const cfg = resolveConfig({
      CRUCIBLE_FOUNDRY_URL: '',
      CRUCIBLE_TEST_ENV_URL: 'http://fallback:1234',
    });
    expect(cfg.adapter.url).toBe('http://fallback:1234');
  });

  it('selects a consumer-registered adapter via CRUCIBLE_ADAPTER', () => {
    defineAdapter({
      name: 'my-app',
      createAdapter: ({ url }) => ({ name: 'my-app', url: url || 'https://my-app.example.com', authStrategy: 'cookie-handoff' }),
    });
    const cfg = resolveConfig({
      CRUCIBLE_ADAPTER: 'my-app',
      CRUCIBLE_MY_APP_URL: 'https://staging.my-app.example.com',
    });
    expect(cfg.adapter.name).toBe('my-app');
    expect(cfg.adapter.url).toBe('https://staging.my-app.example.com');
    expect(cfg.adapter.authStrategy).toBe('cookie-handoff');
  });
});
