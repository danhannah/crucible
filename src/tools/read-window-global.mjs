import { z } from 'zod';

export const name = 'read_window_global';

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const DEFAULT_MAX_BYTES = 100 * 1024;

export const config = {
  description:
    'Read a top-level property of `window` in the current page context and return its value as JSON. ' +
    'Useful for inspecting app-published state — e.g. `__bw_state`, `__ws_trace__`, debug snapshots. ' +
    'The name must be a single JavaScript identifier; nested paths and arbitrary expressions are rejected. ' +
    'Returns { ok, exists, value, truncated, sizeBytes }: `exists=false` when the property is `undefined`, ' +
    '`value=null` when it is literally `null`, `truncated=true` (with `value=null`) when the serialized ' +
    `value exceeds maxBytes (default ${DEFAULT_MAX_BYTES} bytes; pass 0 to disable).`,
  inputSchema: {
    name: z
      .string()
      .describe('Top-level property name on `window` (e.g. `__bw_state`). Must be a JS identifier.'),
    maxBytes: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(`Soft cap on returned JSON byte size. Default ${DEFAULT_MAX_BYTES}. Pass 0 to disable.`),
  },
};

function buildExpression(rawName, maxBytes) {
  const k = JSON.stringify(rawName);
  const cap = Number.isFinite(maxBytes) ? maxBytes : DEFAULT_MAX_BYTES;
  return `(() => {
    const v = window[${k}];
    if (typeof v === 'undefined') return { exists: false };
    let serialized;
    try {
      serialized = JSON.stringify(v);
    } catch (e) {
      return { exists: true, error: 'not_serializable', errorMessage: (e && e.message) || String(e) };
    }
    if (typeof serialized === 'undefined') {
      return { exists: true, error: 'not_serializable', errorMessage: 'value at top level is not JSON-representable (function or symbol)' };
    }
    const sizeBytes = serialized.length;
    if (${cap} > 0 && sizeBytes > ${cap}) {
      return { exists: true, truncated: true, sizeBytes };
    }
    return { exists: true, sizeBytes, json: serialized };
  })()`;
}

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
              error: `invalid identifier ${JSON.stringify(args.name)} — must match /^[A-Za-z_$][A-Za-z0-9_$]*$/`,
            }),
          },
        ],
      };
    }

    const maxBytes = typeof args.maxBytes === 'number' ? args.maxBytes : DEFAULT_MAX_BYTES;

    let raw;
    try {
      raw = await session.driver.evaluate(buildExpression(args.name, maxBytes));
    } catch (e) {
      const msg = e?.message || String(e);
      const hint = /circular|cyclic|stack/i.test(msg)
        ? ` (value at window[${JSON.stringify(args.name)}] may contain circular references or DOM nodes; not JSON-serializable)`
        : /detached|navigation|destroyed|context/i.test(msg)
        ? ' (page may have navigated mid-call; retry after the navigation settles)'
        : '';
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `failed to read window[${JSON.stringify(args.name)}]: ${msg}${hint}`,
            }),
          },
        ],
      };
    }

    if (!raw.exists) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ ok: true, exists: false, value: null }, null, 2) },
        ],
      };
    }

    if (raw.error === 'not_serializable') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `value at window[${JSON.stringify(args.name)}] is not JSON-serializable: ${raw.errorMessage}. Check for circular references, DOM nodes, or non-plain values.`,
            }),
          },
        ],
      };
    }

    if (raw.truncated) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { ok: true, exists: true, truncated: true, sizeBytes: raw.sizeBytes, value: null },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, exists: true, truncated: false, sizeBytes: raw.sizeBytes, value: JSON.parse(raw.json) },
            null,
            2,
          ),
        },
      ],
    };
  };
}
