import { z } from 'zod';

export const name = 'read_window_global';

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const config = {
  description:
    'Read a top-level property of `window` in the current page context and return its value as JSON. ' +
    'Useful for inspecting app-published state — e.g. `__bw_state`, `__ws_trace__`, debug snapshots. ' +
    'The name must be a single JavaScript identifier; nested paths and arbitrary expressions are rejected. ' +
    'Returns { ok, exists, value }: `exists=false` when the property is `undefined`, `value=null` when it is literally `null`.',
  inputSchema: {
    name: z
      .string()
      .describe('Top-level property name on `window` (e.g. `__bw_state`). Must be a JS identifier.'),
  },
};

export function createHandler(session) {
  return async (args) => {
    if (!IDENTIFIER_RE.test(args.name)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `invalid identifier "${args.name}" — must match /^[A-Za-z_$][A-Za-z0-9_$]*$/`,
            }),
          },
        ],
      };
    }

    let raw;
    try {
      raw = await session.driver.evaluate(
        `(() => { const k = ${JSON.stringify(args.name)}; const v = window[k]; return { exists: typeof v !== 'undefined', value: typeof v === 'undefined' ? null : v }; })()`,
      );
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `failed to read window["${args.name}"]: ${e?.message || String(e)}`,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, exists: raw.exists, value: raw.value }, null, 2),
        },
      ],
    };
  };
}
