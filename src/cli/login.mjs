import {
  loadAdaptersFromConfig,
  resolveAdapter,
  listAdapters,
} from '../adapters/index.mjs';
import { captureStorageState } from '../adapters/login.mjs';

export async function runLogin({
  flags,
  out,
  err,
  env,
  capture = captureStorageState,
  loadConfig = loadAdaptersFromConfig,
} = {}) {
  const adapterName = flags?.adapter || env?.CRUCIBLE_ADAPTER;
  if (!adapterName) {
    err('crucible login: --adapter=<name> is required (or set CRUCIBLE_ADAPTER).');
    return 2;
  }

  try {
    await loadConfig();
  } catch (e) {
    err(`crucible login: failed to load crucible.config.mjs (${e.message})`);
    return 1;
  }

  let adapter;
  try {
    const url = env?.[`CRUCIBLE_${adapterName.toUpperCase().replace(/-/g, '_')}_URL`];
    adapter = resolveAdapter(adapterName, { url });
  } catch (e) {
    err(`crucible login: ${e.message}`);
    err(`known adapters: ${listAdapters().join(', ') || '(none registered)'}`);
    return 1;
  }

  if (adapter.authStrategy !== 'cookie-handoff') {
    err(`crucible login: adapter "${adapter.name}" uses authStrategy="${adapter.authStrategy}", which does not require an interactive login.`);
    return 1;
  }

  if (!adapter.url) {
    err(`crucible login: adapter "${adapter.name}" has no URL. Set CRUCIBLE_${adapter.name.toUpperCase().replace(/-/g, '_')}_URL.`);
    return 1;
  }

  out(`crucible login: ${adapter.name} → ${adapter.url}`);

  try {
    const path = await capture({
      adapter,
      log: (msg) => err(msg),
    });
    out(`crucible login: saved storageState to ${path}`);
    return 0;
  } catch (e) {
    err(`crucible login: capture failed (${e.message})`);
    return 1;
  }
}
