import { describe, it, expect } from 'vitest';
import { listAdapters, resolveAdapter } from '../../src/adapters/index.mjs';
import { resolveConfig, DEFAULT_TEST_ENV_URL } from '../../src/config.mjs';

describe('adapters', () => {
  it('registers foundry and blackwing', () => {
    expect(listAdapters().sort()).toEqual(['blackwing', 'foundry']);
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

  it('blackwing adapter requires URL', () => {
    expect(() => resolveAdapter('blackwing')).toThrow(/CRUCIBLE_BLACKWING_URL/);
  });

  it('blackwing adapter declares cookie-handoff auth strategy', () => {
    const a = resolveAdapter('blackwing', { url: 'https://blackwing.example.com' });
    expect(a.name).toBe('blackwing');
    expect(a.url).toBe('https://blackwing.example.com');
    expect(a.authStrategy).toBe('cookie-handoff');
    expect(a.storageStatePath).toBeNull();
  });

  it('unknown adapter throws with helpful message', () => {
    expect(() => resolveAdapter('nope')).toThrow(/unknown adapter "nope"/);
  });
});

describe('resolveConfig', () => {
  it('defaults to foundry adapter and legacy CRUCIBLE_TEST_ENV_URL', () => {
    const cfg = resolveConfig({ CRUCIBLE_TEST_ENV_URL: 'http://legacy:1234' });
    expect(cfg.adapter.name).toBe('foundry');
    expect(cfg.adapter.url).toBe('http://legacy:1234');
    expect(cfg.testEnvUrl).toBe('http://legacy:1234');
  });

  it('selects blackwing via CRUCIBLE_ADAPTER + CRUCIBLE_BLACKWING_URL', () => {
    const cfg = resolveConfig({
      CRUCIBLE_ADAPTER: 'blackwing',
      CRUCIBLE_BLACKWING_URL: 'https://blackwing.gmppu.com',
    });
    expect(cfg.adapter.name).toBe('blackwing');
    expect(cfg.adapter.url).toBe('https://blackwing.gmppu.com');
    expect(cfg.testEnvUrl).toBe('https://blackwing.gmppu.com');
  });

  it('CRUCIBLE_FOUNDRY_URL overrides legacy CRUCIBLE_TEST_ENV_URL when both set', () => {
    const cfg = resolveConfig({
      CRUCIBLE_FOUNDRY_URL: 'http://new:9999',
      CRUCIBLE_TEST_ENV_URL: 'http://legacy:1234',
    });
    expect(cfg.adapter.url).toBe('http://new:9999');
  });

  it('blackwing without URL surfaces clear error', () => {
    expect(() => resolveConfig({ CRUCIBLE_ADAPTER: 'blackwing' })).toThrow(/CRUCIBLE_BLACKWING_URL/);
  });
});
