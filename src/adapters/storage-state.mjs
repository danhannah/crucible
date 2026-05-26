import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export const DEFAULT_STORAGE_STATE_ROOT = path.join(os.homedir(), '.crucible', 'state');

export function storageStatePathFor(adapterName, { root = DEFAULT_STORAGE_STATE_ROOT } = {}) {
  if (typeof adapterName !== 'string' || adapterName.length === 0) {
    throw new Error('adapterName is required');
  }
  if (adapterName.includes('/') || adapterName.includes('\\') || adapterName.includes('..')) {
    throw new Error(`invalid adapter name "${adapterName}"`);
  }
  return path.join(root, `${adapterName}.json`);
}

export async function storageStateExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readStorageState(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeStorageState(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
}

export async function deleteStorageState(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}
