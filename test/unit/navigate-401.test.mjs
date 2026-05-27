import { describe, it, expect } from 'vitest';
import { createHandler } from '../../src/tools/navigate.mjs';

const session = ({ status, adapterName = 'blackwing' } = {}) => ({
  driver: {
    navigate: async (url) => ({ url, status }),
  },
  config: adapterName === null ? {} : { adapter: { name: adapterName } },
});

const parse = (res) => JSON.parse(res.content[0].text);

describe('navigate — 401 detection', () => {
  it('returns isError + actionable remedy on a 401 response', async () => {
    const handler = createHandler(session({ status: 401, adapterName: 'blackwing' }));
    const res = await handler({ url: 'https://blackwing.example.com/' });
    expect(res.isError).toBe(true);
    const body = parse(res);
    expect(body.ok).toBe(false);
    expect(body.status).toBe(401);
    expect(body.url).toBe('https://blackwing.example.com/');
    expect(body.error).toBe('HTTP 401 (authentication required). Run: crucible login --adapter=blackwing');
  });

  it('falls back to a generic remedy when no adapter is configured', async () => {
    const handler = createHandler(session({ status: 401, adapterName: null }));
    const res = await handler({ url: 'https://x.example.com/' });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toMatch(/crucible login --adapter=<name>/);
  });

  it('passes through 200 responses unchanged', async () => {
    const handler = createHandler(session({ status: 200 }));
    const res = await handler({ url: 'https://x.example.com/' });
    expect(res.isError).toBeUndefined();
    expect(parse(res)).toEqual({ ok: true, url: 'https://x.example.com/', status: 200 });
  });

  it('does not blanket-fail on 403 / 404 / 5xx — only 401 is the auth signal', async () => {
    for (const status of [403, 404, 500, 502]) {
      const handler = createHandler(session({ status }));
      const res = await handler({ url: 'https://x.example.com/' });
      expect(res.isError).toBeUndefined();
      expect(parse(res).ok).toBe(true);
      expect(parse(res).status).toBe(status);
    }
  });

  it('passes through null status (e.g. about:blank) unchanged', async () => {
    const handler = createHandler(session({ status: null }));
    const res = await handler({ url: 'about:blank' });
    expect(res.isError).toBeUndefined();
    expect(parse(res).ok).toBe(true);
  });

  it('uses the active adapter in the remedy regardless of which URL was navigated', async () => {
    // adapter context = 'blackwing', but the URL is unrelated. The remedy should still name the adapter.
    const handler = createHandler(session({ status: 401, adapterName: 'blackwing' }));
    const res = await handler({ url: 'https://some-other-domain.example.com/' });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toMatch(/--adapter=blackwing/);
  });
});
