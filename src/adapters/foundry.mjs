export const name = 'foundry';

export function createAdapter({ url } = {}) {
  return {
    name,
    url: url || 'http://127.0.0.1:54321',
    authStrategy: 'none',
  };
}
