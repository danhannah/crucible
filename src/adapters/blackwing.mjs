export const name = 'blackwing';

export function createAdapter({ url } = {}) {
  if (!url) {
    throw new Error('blackwing adapter requires CRUCIBLE_BLACKWING_URL (or url config)');
  }
  return {
    name,
    url,
    authStrategy: 'cookie-handoff',
    storageStatePath: null,
  };
}
