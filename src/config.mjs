import os from 'node:os';
import path from 'node:path';
import { resolveAdapter } from './adapters/index.mjs';

export const DEFAULT_TEST_ENV_URL = 'http://127.0.0.1:54321';

export const DEFAULT_BASELINE_ROOT = path.join(os.homedir(), '.crucible', 'baselines');

export const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export const DEFAULT_BROWSER = 'chromium';

export const DEFAULT_ADAPTER = 'foundry';

function envValue(env, key) {
  const v = env[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function envKeyForAdapter(name) {
  return `CRUCIBLE_${name.toUpperCase().replace(/-/g, '_')}_URL`;
}

function adapterUrlFromEnv(name, env) {
  const explicit = envValue(env, envKeyForAdapter(name));
  if (explicit) return explicit;
  if (name === 'foundry') return envValue(env, 'CRUCIBLE_TEST_ENV_URL');
  return undefined;
}

export function resolveConfig(env = process.env) {
  const adapterName = envValue(env, 'CRUCIBLE_ADAPTER') || DEFAULT_ADAPTER;
  const adapter = resolveAdapter(adapterName, { url: adapterUrlFromEnv(adapterName, env) });
  return {
    adapter,
    testEnvUrl: adapter.url,
    baselineRoot: envValue(env, 'CRUCIBLE_BASELINE_ROOT') || DEFAULT_BASELINE_ROOT,
    viewport: DEFAULT_VIEWPORT,
    browser: DEFAULT_BROWSER,
  };
}
