import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseArgs, runCli } from '../../src/cli/index.mjs';
import { runLogin } from '../../src/cli/login.mjs';
import { defineAdapter, clearAdapters } from '../../src/adapters/index.mjs';

beforeEach(() => {
  clearAdapters();
});

describe('parseArgs', () => {
  it('treats no args as help', () => {
    expect(parseArgs([])).toEqual({ command: 'help' });
  });

  it('treats -h / --help as help', () => {
    expect(parseArgs(['-h'])).toEqual({ command: 'help' });
    expect(parseArgs(['--help'])).toEqual({ command: 'help' });
  });

  it('parses subcommand and --key=value flags', () => {
    expect(parseArgs(['login', '--adapter=blackwing'])).toEqual({
      command: 'login',
      flags: { adapter: 'blackwing' },
    });
  });

  it('parses bare boolean flags', () => {
    expect(parseArgs(['login', '--verbose'])).toEqual({
      command: 'login',
      flags: { verbose: true },
    });
  });

  it('rejects positional arguments', () => {
    expect(() => parseArgs(['login', 'blackwing'])).toThrow(/unrecognized argument/);
  });
});

describe('runCli', () => {
  const captureLog = () => {
    const out = [];
    const err = [];
    return {
      out: (m) => out.push(m),
      err: (m) => err.push(m),
      logs: { out, err },
    };
  };

  it('prints help and exits 0 with no args', async () => {
    const sink = captureLog();
    const code = await runCli([], { out: sink.out, err: sink.err, env: {} });
    expect(code).toBe(0);
    expect(sink.logs.out.join('\n')).toMatch(/Usage: crucible/);
  });

  it('exits 2 on unknown command', async () => {
    const sink = captureLog();
    const code = await runCli(['notacommand'], { out: sink.out, err: sink.err, env: {} });
    expect(code).toBe(2);
    expect(sink.logs.err.join('\n')).toMatch(/unknown command/);
  });

  it('exits 2 on unrecognized flag style', async () => {
    const sink = captureLog();
    const code = await runCli(['login', 'positional'], { out: sink.out, err: sink.err, env: {} });
    expect(code).toBe(2);
    expect(sink.logs.err.join('\n')).toMatch(/unrecognized argument/);
  });
});

describe('runLogin', () => {
  const captureLog = () => {
    const out = [];
    const err = [];
    return {
      out: (m) => out.push(m),
      err: (m) => err.push(m),
      logs: { out, err },
    };
  };

  it('errors when --adapter is missing and CRUCIBLE_ADAPTER unset', async () => {
    const sink = captureLog();
    const code = await runLogin({
      flags: {},
      out: sink.out,
      err: sink.err,
      env: {},
      capture: vi.fn(),
      loadConfig: async () => null,
    });
    expect(code).toBe(2);
    expect(sink.logs.err.join('\n')).toMatch(/--adapter=<name> is required/);
  });

  it('errors when adapter is unknown', async () => {
    const sink = captureLog();
    const code = await runLogin({
      flags: { adapter: 'ghost' },
      out: sink.out,
      err: sink.err,
      env: {},
      capture: vi.fn(),
      loadConfig: async () => null,
    });
    expect(code).toBe(1);
    expect(sink.logs.err.join('\n')).toMatch(/unknown adapter "ghost"/);
  });

  it('refuses adapters whose authStrategy is not cookie-handoff', async () => {
    defineAdapter({
      name: 'noauth',
      createAdapter: ({ url }) => ({ name: 'noauth', url: url || 'http://x', authStrategy: 'none' }),
    });
    const sink = captureLog();
    const code = await runLogin({
      flags: { adapter: 'noauth' },
      out: sink.out,
      err: sink.err,
      env: {},
      capture: vi.fn(),
      loadConfig: async () => null,
    });
    expect(code).toBe(1);
    expect(sink.logs.err.join('\n')).toMatch(/does not require an interactive login/);
  });

  it('refuses cookie-handoff adapters with no URL', async () => {
    defineAdapter({
      name: 'no-url',
      createAdapter: () => ({ name: 'no-url', url: undefined, authStrategy: 'cookie-handoff' }),
    });
    const sink = captureLog();
    const code = await runLogin({
      flags: { adapter: 'no-url' },
      out: sink.out,
      err: sink.err,
      env: {},
      capture: vi.fn(),
      loadConfig: async () => null,
    });
    expect(code).toBe(1);
    expect(sink.logs.err.join('\n')).toMatch(/has no URL.*CRUCIBLE_NO_URL_URL/);
  });

  it('invokes captureStorageState for a valid adapter and returns 0', async () => {
    defineAdapter({
      name: 'authed',
      createAdapter: ({ url }) => ({
        name: 'authed',
        url: url || 'https://authed.example.com',
        authStrategy: 'cookie-handoff',
        storageStatePath: '/tmp/authed.json',
      }),
    });
    const captured = vi.fn(async ({ adapter }) => adapter.storageStatePath);
    const sink = captureLog();
    const code = await runLogin({
      flags: { adapter: 'authed' },
      out: sink.out,
      err: sink.err,
      env: { CRUCIBLE_AUTHED_URL: 'https://authed.example.com' },
      capture: captured,
      loadConfig: async () => null,
    });
    expect(code).toBe(0);
    expect(captured).toHaveBeenCalledOnce();
    const [{ adapter }] = captured.mock.calls[0];
    expect(adapter.name).toBe('authed');
    expect(adapter.url).toBe('https://authed.example.com');
    expect(sink.logs.out.join('\n')).toMatch(/saved storageState to \/tmp\/authed\.json/);
  });

  it('surfaces capture errors as exit code 1', async () => {
    defineAdapter({
      name: 'authed',
      createAdapter: ({ url }) => ({
        name: 'authed',
        url: url || 'https://authed.example.com',
        authStrategy: 'cookie-handoff',
        storageStatePath: '/tmp/authed.json',
      }),
    });
    const captured = vi.fn(async () => { throw new Error('boom'); });
    const sink = captureLog();
    const code = await runLogin({
      flags: { adapter: 'authed' },
      out: sink.out,
      err: sink.err,
      env: {},
      capture: captured,
      loadConfig: async () => null,
    });
    expect(code).toBe(1);
    expect(sink.logs.err.join('\n')).toMatch(/capture failed \(boom\)/);
  });
});
