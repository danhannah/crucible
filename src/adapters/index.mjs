import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import * as foundry from './foundry.mjs';

/**
 * @typedef {Object} Adapter
 * @property {string} name        - Unique adapter name (e.g. 'foundry').
 * @property {string} url         - Base URL for the test target.
 * @property {string} authStrategy - One of: 'none', 'cookie-handoff', or a future strategy.
 * @property {Object} [extra]     - Adapter-specific extension fields. Strategies that need
 *                                  storage (e.g. 'cookie-handoff') document their own keys.
 */

/**
 * @typedef {Object} AdapterDefinition
 * @property {string} name
 * @property {(opts: { url?: string }) => Adapter} createAdapter
 */

const REGISTRY = new Map();

export function defineAdapter(definition) {
  if (!definition || typeof definition.name !== 'string' || typeof definition.createAdapter !== 'function') {
    throw new Error('defineAdapter requires { name: string, createAdapter: function }');
  }
  REGISTRY.set(definition.name, definition);
  return definition;
}

export function clearAdapters() {
  REGISTRY.clear();
  registerBuiltIns();
}

export function listAdapters() {
  return Array.from(REGISTRY.keys());
}

export function resolveAdapter(name, { url } = {}) {
  const def = REGISTRY.get(name);
  if (!def) {
    throw new Error(`unknown adapter "${name}". known: ${listAdapters().join(', ') || '(none)'}. Register one via crucible.config.mjs or defineAdapter().`);
  }
  return def.createAdapter({ url });
}

function registerBuiltIns() {
  defineAdapter(foundry);
}

registerBuiltIns();

/**
 * Loads adapter registrations from a `crucible.config.mjs` (or `.js`) in the
 * given directory, if present. Resolved silently when no file exists.
 *
 * The config module may default-export an array of AdapterDefinition objects,
 * or a function returning one — or simply call `defineAdapter()` at import time.
 */
export async function loadAdaptersFromConfig({ cwd = process.cwd() } = {}) {
  const candidates = ['crucible.config.mjs', 'crucible.config.js'];
  for (const file of candidates) {
    const abs = path.join(cwd, file);
    try {
      await fs.access(abs);
    } catch {
      continue;
    }
    const mod = await import(pathToFileURL(abs).href);
    const exported = typeof mod.default === 'function' ? await mod.default() : mod.default;
    if (Array.isArray(exported)) {
      for (const def of exported) defineAdapter(def);
    }
    return abs;
  }
  return null;
}
