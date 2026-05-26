import { describe, it, expect, vi } from 'vitest';
import { createHandler, name, config, DEFAULT_MAX_BYTES } from '../../src/tools/read-window-global.mjs';

// Each handler call passes a JS expression to driver.evaluate. Tests stub the
// evaluate result directly with the shape the in-page IIFE would have returned.
const sessionReturning = (resultOrFn) => ({
  driver: {
    evaluate: typeof resultOrFn === 'function'
      ? resultOrFn
      : async () => resultOrFn,
  },
});

const sessionThrowing = (err) => ({
  driver: { evaluate: async () => { throw err; } },
});

const parseResult = (res) => JSON.parse(res.content[0].text);

const buildExisting = (value) => ({
  exists: true,
  sizeBytes: JSON.stringify(value).length,
  json: JSON.stringify(value),
});

describe('read_window_global tool — schema + name', () => {
  it('exposes the expected name + schema', () => {
    expect(name).toBe('read_window_global');
    expect(config.description).toMatch(/window/);
    expect(config.inputSchema.name).toBeDefined();
    expect(config.inputSchema.maxBytes).toBeDefined();
  });
});

describe('happy path', () => {
  it('returns ok/exists=true with the value when window[name] is set', async () => {
    const handler = createHandler(sessionReturning(buildExisting({ foo: 1 })));
    const res = await handler({ name: '__bw_state' });
    expect(res.isError).toBeUndefined();
    expect(parseResult(res)).toMatchObject({ ok: true, exists: true, truncated: false, value: { foo: 1 } });
  });

  it('returns ok/exists=false when window[name] is undefined', async () => {
    const handler = createHandler(sessionReturning({ exists: false }));
    const res = await handler({ name: 'not_set' });
    expect(parseResult(res)).toEqual({ ok: true, exists: false, value: null });
  });

  it('distinguishes undefined from explicit null', async () => {
    const handler = createHandler(sessionReturning(buildExisting(null)));
    const res = await handler({ name: 'explicit_null' });
    expect(parseResult(res)).toMatchObject({ ok: true, exists: true, value: null });
  });

  it('round-trips falsy values (0, false, "")', async () => {
    for (const value of [0, false, '']) {
      const handler = createHandler(sessionReturning(buildExisting(value)));
      const res = await handler({ name: 'falsy' });
      expect(res.isError).toBeUndefined();
      expect(parseResult(res)).toMatchObject({ ok: true, exists: true, value });
    }
  });
});

describe('identifier validation', () => {
  it('rejects identifiers with whitespace', async () => {
    const handler = createHandler(sessionReturning(buildExisting(1)));
    const res = await handler({ name: 'foo bar' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/invalid identifier/);
  });

  it('renders the offending name JSON-quoted in the error', async () => {
    const handler = createHandler(sessionReturning(buildExisting(1)));
    const res = await handler({ name: 'has"quote' });
    expect(res.isError).toBe(true);
    // String must contain JSON.stringify('has"quote') === '"has\\"quote"'
    expect(parseResult(res).error).toContain('"has\\"quote"');
  });

  it('rejects nested paths and dotted access attempts', async () => {
    const handler = createHandler(sessionReturning(buildExisting(1)));
    for (const bad of ['a.b', 'a["b"]', 'foo()', 'foo + 1', "name'; alert(1); //", '']) {
      const res = await handler({ name: bad });
      expect(res.isError).toBe(true);
    }
  });

  it('accepts identifiers starting with $ or _', async () => {
    const handler = createHandler(sessionReturning(buildExisting('ok')));
    for (const good of ['$foo', '_foo', '__bw_state', '__ws_trace__', 'a1']) {
      const res = await handler({ name: good });
      expect(res.isError).toBeUndefined();
    }
  });

  it('passes the name through JSON.stringify in the evaluate expression (no injection)', async () => {
    const evaluate = vi.fn(async () => ({ exists: false }));
    const handler = createHandler({ driver: { evaluate } });
    await handler({ name: 'normal_name' });
    expect(evaluate).toHaveBeenCalledOnce();
    const expr = evaluate.mock.calls[0][0];
    expect(expr).toContain('"normal_name"');
    expect(expr).not.toContain("'; alert(1); //");
  });
});

describe('size cap', () => {
  it('default ~100KB cap is set', () => {
    expect(DEFAULT_MAX_BYTES).toBe(100 * 1024);
  });

  it('truncates values larger than the cap, returns sizeBytes + truncated=true + value=null', async () => {
    const handler = createHandler(sessionReturning({ exists: true, truncated: true, sizeBytes: 250_000 }));
    const res = await handler({ name: '__big' });
    expect(res.isError).toBeUndefined();
    expect(parseResult(res)).toEqual({ ok: true, exists: true, truncated: true, sizeBytes: 250_000, value: null });
  });

  it('embeds the cap into the evaluate expression so truncation happens in-page', async () => {
    const evaluate = vi.fn(async () => ({ exists: false }));
    const handler = createHandler({ driver: { evaluate } });
    await handler({ name: 'foo', maxBytes: 4096 });
    const expr = evaluate.mock.calls[0][0];
    expect(expr).toContain('4096');
  });

  it('uses default cap when maxBytes is omitted', async () => {
    const evaluate = vi.fn(async () => ({ exists: false }));
    const handler = createHandler({ driver: { evaluate } });
    await handler({ name: 'foo' });
    const expr = evaluate.mock.calls[0][0];
    expect(expr).toContain(String(DEFAULT_MAX_BYTES));
  });

  it('passes maxBytes=0 through to disable the cap in-page', async () => {
    const evaluate = vi.fn(async () => ({ exists: false }));
    const handler = createHandler({ driver: { evaluate } });
    await handler({ name: 'foo', maxBytes: 0 });
    const expr = evaluate.mock.calls[0][0];
    // 0 > 0 short-circuits the cap branch in the IIFE
    expect(expr).toContain('0 > 0');
  });
});

describe('non-serializable values', () => {
  it('flags circular / non-serializable values as a friendly tool error', async () => {
    const handler = createHandler(
      sessionReturning({ exists: true, error: 'not_serializable', errorMessage: 'Converting circular structure to JSON' }),
    );
    const res = await handler({ name: '__circular' });
    expect(res.isError).toBe(true);
    const body = parseResult(res);
    expect(body.error).toMatch(/not JSON-serializable/);
    expect(body.error).toMatch(/circular references, DOM nodes/);
  });
});

describe('evaluate-error wrapping', () => {
  it('wraps generic evaluate errors as a friendly tool error', async () => {
    const handler = createHandler(sessionThrowing(new Error('page closed')));
    const res = await handler({ name: 'whatever' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/failed to read window\["whatever"\]: page closed/);
  });

  it('appends a circular-reference hint when the underlying message looks circular', async () => {
    const handler = createHandler(sessionThrowing(new Error('Maximum call stack size exceeded')));
    const res = await handler({ name: 'recursive' });
    expect(parseResult(res).error).toMatch(/circular references or DOM nodes/);
  });

  it('appends a navigation hint when the page detached mid-call', async () => {
    const handler = createHandler(sessionThrowing(new Error('Execution context was destroyed, most likely because of a navigation')));
    const res = await handler({ name: 'state' });
    expect(parseResult(res).error).toMatch(/page may have navigated mid-call/);
  });
});
