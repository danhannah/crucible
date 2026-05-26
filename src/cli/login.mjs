import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  loadAdaptersFromConfig,
  listAdapters,
} from '../adapters/index.mjs';
import { resolveConfig } from '../config.mjs';
import { captureStorageState } from '../adapters/login.mjs';

/**
 * @typedef {Object} CliIO
 * @property {(msg: string) => void} out  - Writes to stdout (final results meant for pipes)
 * @property {(msg: string) => void} err  - Writes to stderr (status, errors, hints)
 * @property {Record<string, string|undefined>} env - Environment variables
 */

/**
 * @typedef {CliIO & {
 *   flags?: Record<string, string|boolean>,
 *   capture?: typeof captureStorageState,
 *   loadConfig?: typeof loadAdaptersFromConfig,
 *   cwd?: string,
 * }} RunLoginOptions
 */

async function configFileExists(cwd) {
  for (const f of ['crucible.config.mjs', 'crucible.config.js']) {
    try {
      await fs.access(path.join(cwd, f));
      return true;
    } catch {}
  }
  return false;
}

/**
 * @param {RunLoginOptions} opts
 * @returns {Promise<number>} exit code
 */
export async function runLogin({
  flags,
  out,
  err,
  env,
  capture = captureStorageState,
  loadConfig = loadAdaptersFromConfig,
  cwd = process.cwd(),
} = {}) {
  const adapterName = flags?.adapter || env?.CRUCIBLE_ADAPTER;
  if (!adapterName) {
    err('crucible login: --adapter=<name> is required (or set CRUCIBLE_ADAPTER).');
    return 2;
  }

  try {
    await loadConfig({ cwd });
  } catch (e) {
    err(`crucible login: failed to load crucible.config.mjs (${e.message})`);
    return 1;
  }

  let cfg;
  try {
    cfg = resolveConfig({ ...env, CRUCIBLE_ADAPTER: adapterName });
  } catch (e) {
    err(`crucible login: ${e.message}`);
    err(`known adapters: ${listAdapters().join(', ') || '(none registered)'}`);
    if (!(await configFileExists(cwd))) {
      err(`hint: no crucible.config.mjs found in ${cwd} — run from your project root, or register the adapter via defineAdapter().`);
    }
    return 1;
  }

  const adapter = cfg.adapter;

  if (adapter.authStrategy !== 'cookie-handoff') {
    err(`crucible login: adapter "${adapter.name}" uses authStrategy="${adapter.authStrategy}", which does not require an interactive login.`);
    return 1;
  }

  if (!adapter.url) {
    err(`crucible login: adapter "${adapter.name}" has no URL. Set CRUCIBLE_${adapter.name.toUpperCase().replace(/-/g, '_')}_URL.`);
    return 1;
  }

  err(`crucible login: ${adapter.name} → ${adapter.url}`);

  try {
    const savedPath = await capture({
      adapter,
      log: (msg) => err(msg),
    });
    out(savedPath);
    return 0;
  } catch (e) {
    err(`crucible login: capture failed (${e.message})`);
    return 1;
  }
}
