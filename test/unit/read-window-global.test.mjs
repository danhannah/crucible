import { describe, it, expect, vi } from 'vitest';
import { createHandler, name, config } from '../../src/tools/read-window-global.mjs';

const makeSession = (evaluateFn) => ({
  driver: { evaluate: evaluateFn },
});

const parseResult = (res) => JSON.parse(res.content[0].text);

describe('read_window_global tool', () => {
  it('exposes the expected name + schema', () => {
    expect(name).toBe('read_window_global');
    expect(config.description).toMatch(/window/);
    expect(config.inputSchema.name).toBeDefined();
  });

  it('returns ok/exists=true with the value when window[name] is set', async () => {
    const handler = createHandler(makeSession(async () => ({ exists: true, value: { foo: 1 } })));
    const res = await handler({ name: '__bw_state' });
    expect(res.isError).toBeUndefined();
    expect(parseResult(res)).toEqual({ ok: true, exists: true, value: { foo: 1 } });
  });

  it('returns ok/exists=false/value=null when window[name] is undefined', async () => {
    const handler = createHandler(makeSession(async () => ({ exists: false, value: null })));
    const res = await handler({ name: 'not_set' });
    expect(parseResult(res)).toEqual({ ok: true, exists: false, value: null });
  });

  it('distinguishes undefined from explicit null', async () => {
    const handler = createHandler(makeSession(async () => ({ exists: true, value: null })));
    const res = await handler({ name: 'explicit_null' });
    expect(parseResult(res)).toEqual({ ok: true, exists: true, value: null });
  });

  it('rejects identifiers with whitespace', async () => {
    const handler = createHandler(makeSession(async () => ({ exists: true, value: 1 })));
    const res = await handler({ name: 'foo bar' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/invalid identifier/);
  });

  it('rejects nested paths and dotted access attempts', async () => {
    const handler = createHandler(makeSession(async () => ({ exists: true, value: 1 })));
    for (const bad of ['a.b', 'a["b"]', 'foo()', 'foo + 1', "name'; alert(1); //", '']) {
      const res = await handler({ name: bad });
      expect(res.isError).toBe(true);
    }
  });

  it('accepts identifiers starting with $ or _', async () => {
    const handler = createHandler(makeSession(async () => ({ exists: true, value: 'ok' })));
    for (const good of ['$foo', '_foo', '__bw_state', '__ws_trace__', 'a1']) {
      const res = await handler({ name: good });
      expect(res.isError).toBeUndefined();
    }
  });

  it('passes the name through JSON.stringify in the evaluate expression (no injection)', async () => {
    const evaluate = vi.fn(async () => ({ exists: false, value: null }));
    const handler = createHandler(makeSession(evaluate));
    await handler({ name: 'normal_name' });
    expect(evaluate).toHaveBeenCalledOnce();
    const expr = evaluate.mock.calls[0][0];
    expect(expr).toContain('"normal_name"');
    expect(expr).not.toContain("'; alert(1); //");
  });

  it('wraps evaluate errors as a friendly tool error', async () => {
    const handler = createHandler(makeSession(async () => { throw new Error('page closed'); }));
    const res = await handler({ name: 'whatever' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/failed to read window\["whatever"\]: page closed/);
  });
});
