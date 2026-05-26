import * as foundry from './foundry.mjs';
import * as blackwing from './blackwing.mjs';

const REGISTRY = new Map([
  [foundry.name, foundry],
  [blackwing.name, blackwing],
]);

export function listAdapters() {
  return Array.from(REGISTRY.keys());
}

export function resolveAdapter(name, { url } = {}) {
  const mod = REGISTRY.get(name);
  if (!mod) {
    throw new Error(`unknown adapter "${name}". known: ${listAdapters().join(', ')}`);
  }
  return mod.createAdapter({ url });
}
