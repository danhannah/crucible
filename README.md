# Crucible

> **Agentic QA framework that gives AI coding agents eyes.** A project-agnostic MCP server for visual verification, baseline management, and repeatable browser testing — built for agents that use your app's own MCP tools (or generic browser tools as a fallback) to interact, and Crucible to *see*.

[![status](https://img.shields.io/badge/status-v0.1%20Eyes%20Only-blue)](./docs/design.md)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![mcp](https://img.shields.io/badge/MCP-native-purple)](https://modelcontextprotocol.io)

The market is full of "AI helps you write Playwright scripts faster." Crucible is the opposite: **the agent is the test runner.** No scripted steps, no brittle selectors. The agent uses domain-specific MCP tools to interact with your app, screenshots the result, compares against stored baselines, and decides pass/fail with judgment.

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  Implementation agent    │  PR ──▶ │  Feature QA agent        │
│  writes code + commits   │         │  + Regression QA agent   │
└──────────────────────────┘         │  use Crucible to SEE     │
                                     │  + app MCP tools to ACT  │
                                     └────────────┬─────────────┘
                                                  │
                                                  ▼
                                     ┌──────────────────────────┐
                                     │  PASS / ISSUES_FOUND     │
                                     │  / NEEDS_HUMAN           │
                                     └──────────────────────────┘
```

---

## Why Crucible

Agents can write code and run tests, but they're **blind to UI**. Every feature pipeline ends at the same handoff: *"…and now the human visually QAs it and merges."* That's the bottleneck.

Crucible closes the loop:

- **Eyes** — Headless Playwright screenshots + pixelmatch diffs + on-disk baseline store. Agents *see* what they changed.
- **Browser fallback** — Generic `navigate` / `click` / `run_script` for apps without their own MCP tools. Training wheels, not the primary interface.
- **Designed for agents, not scripts** — Tools return paths to PNG files on disk, structured JSON metadata, and verdicts the LLM can read.

What it's not: a Playwright replacement, a CI service, or a script runner. The full design is in [`docs/design.md`](./docs/design.md).

---

## Install

```bash
# From an existing project
npm install --save-dev @claymore-dev/crucible
npx playwright install chromium
```

`@claymore-dev/crucible` is not yet on npm during the v0.1 → v1.0 stabilization period. Until it lands, install from git:

```bash
npm install --save-dev github:danhannah94/crucible
```

---

## Wire into Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "crucible": {
      "command": "npx",
      "args": ["-y", "@claymore-dev/crucible"]
    }
  }
}
```

Or, if installed locally to a project:

```json
{
  "mcpServers": {
    "crucible": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/node_modules/@claymore-dev/crucible/bin/crucible-mcp.mjs"]
    }
  }
}
```

Restart Claude Code to pick up the server. Crucible's tools will appear with the `mcp__crucible__` prefix.

---

## Tools (v0.1)

| Tool | Purpose |
|------|---------|
| `navigate` | Go to a URL. Launches the browser on first call. Returns final URL + HTTP status. |
| `screenshot_page` | Full-page or viewport PNG. Saves to a temp file, returns the path + metadata. Caches in-session for `compare_screenshots`. |
| `compare_screenshots` | Diff against a stored baseline via pixelmatch. Returns match score + verdict (`pass`/`fail`/`needs_review`). |
| `approve_baseline` | Write the current screenshot as the baseline for a project/spec. |
| `list_baselines` | List all stored baselines (the regression suite). |
| `run_script` | Run arbitrary JS in the page via `page.evaluate` — set auth tokens, inject CSS, mask dynamic content. |
| `click` | Click an element by CSS selector. |
| `read_window_global` | Read a top-level `window[name]` property as JSON. Strict identifier check (no nested paths). Soft 100KB cap on the returned value (`maxBytes` param to override; `0` disables). Returns `{ ok, exists, truncated, sizeBytes, value }` so undefined, explicit null, and over-cap values are all distinguishable. Non-serializable values (circular refs, DOM nodes) surface as a friendly tool error. |

Coming in v0.2: `boot_project` / `teardown_project` / `seed` (Docker-based harness), plus `type` / `scroll` / `wait_for` (generic browser interaction).

---

## Quick start

Boot any web app on a local port, then:

```bash
# Run the smoke flow against your app
CRUCIBLE_SMOKE_URL=http://localhost:3000 npm run smoke

# Or, from an agent, call the MCP tools:
mcp__crucible__navigate({ url: "http://localhost:3000" })
mcp__crucible__screenshot_page({ fullPage: true })
mcp__crucible__approve_baseline({ project: "my-app", spec: "homepage" })

# Later, after changes:
mcp__crucible__navigate({ url: "http://localhost:3000" })
mcp__crucible__screenshot_page({ fullPage: true })
mcp__crucible__compare_screenshots({ project: "my-app", spec: "homepage" })
```

Baselines land at `~/.crucible/baselines/<project>/<spec>/{baseline.png,meta.json}`.

---

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `CRUCIBLE_ADAPTER` | `foundry` | Active adapter name. Built-in: `foundry`. Consumers register their own — see "Adapters" below. |
| `CRUCIBLE_<NAME>_URL` | — | Per-adapter URL. e.g. `CRUCIBLE_MY_APP_URL=https://my-app.example.com`. Hyphens in adapter names map to underscores in the env-var name. |
| `CRUCIBLE_TEST_ENV_URL` | `http://127.0.0.1:54321` | Legacy alias for `CRUCIBLE_FOUNDRY_URL`. Used when adapter is `foundry` and no `CRUCIBLE_FOUNDRY_URL` is set. Most agents pass URLs explicitly to `navigate`. |
| `CRUCIBLE_BASELINE_ROOT` | `~/.crucible/baselines` | Where baselines are stored. |
| `CRUCIBLE_SMOKE_URL` | `http://127.0.0.1:3000` | URL the `npm run smoke` script targets. |
| `CRUCIBLE_SMOKE_PROJECT` | `crucible-smoke` | Project name for the smoke baseline. |
| `CRUCIBLE_SMOKE_SPEC` | `home` | Spec name for the smoke baseline. |

---

## CLI

The `crucible` binary handles operator tasks that don't fit the MCP server's request/response model — primarily interactive auth.

```bash
# Drive interactive login for a cookie-handoff adapter
crucible login --adapter=my-app

# Or with CRUCIBLE_ADAPTER set
CRUCIBLE_ADAPTER=my-app crucible login

# Help
crucible --help
```

`crucible login` opens a non-headless chromium window pointed at the adapter's URL, waits for the user to complete SSO/2FA, then captures Playwright `storageState` to `~/.crucible/state/<adapter>.json` (mode `0600`). Press **Ctrl+C** in the launching terminal to save and exit. Subsequent headless MCP runs reuse the captured state until it expires.

Exit codes: `0` success, `1` capture/adapter error, `2` usage error.

---

## Adapters

Crucible is project-agnostic. Each app it points at is described by a small **adapter** that declares its base URL and auth strategy. The `foundry` adapter ships built-in as a reference (`auth: none`, default URL `127.0.0.1:54321`). Any other app supplies its own.

Register adapters from a `crucible.config.mjs` in your project root:

```js
// crucible.config.mjs
export default [
  {
    name: 'my-app',
    createAdapter: ({ url }) => {
      if (!url) throw new Error('CRUCIBLE_MY_APP_URL is required');
      return { name: 'my-app', url, authStrategy: 'cookie-handoff' };
    },
  },
];
```

Then run with `CRUCIBLE_ADAPTER=my-app CRUCIBLE_MY_APP_URL=https://my-app.example.com`.

You can also register adapters programmatically by importing `defineAdapter` from `@claymore-dev/crucible/src/adapters/index.mjs`.

### Auth strategies

| Strategy | Behavior |
|----------|----------|
| `none` | No auth. Default for `foundry`. |
| `cookie-handoff` | Adapter loads Playwright `storageState` from `~/.crucible/state/<adapter>.json` (mode `0600`, parent dir `0700`). The user runs `crucible login --adapter=<name>` (M-C3) once to drive interactive SSO/2FA in a non-headless browser; the captured `storageState` is reused on every subsequent headless run. If the file doesn't exist, sessions start unauthenticated. Expired session tokens currently surface as 401s at request time — re-run `crucible login` to refresh. M-C4 will detect this automatically and fail loud with the right message. |

For programmatic capture, import `captureStorageState` from `src/adapters/login.mjs`.

---

## Prompt templates

[`templates/feature-qa.md`](./templates/feature-qa.md) and [`templates/regression-qa.md`](./templates/regression-qa.md) are the orchestrator-facing prompts that drive the two QA agent roles. Fill in the bracketed sections with your project's specifics — feature change description, available app MCP tools, baseline catalog — and hand to a sub-agent.

[`templates/examples/foundry-regression-qa.md`](./templates/examples/foundry-regression-qa.md) is a fully-filled real-world example (Foundry, the doc-review platform Crucible was first built for) showing what a complete prompt looks like.

---

## Develop

```bash
npm install
npx playwright install chromium

# Unit tests
npm test

# Integration test (drives the real MCP server over stdio)
npm run test:integration

# Smoke test against a running app
CRUCIBLE_SMOKE_URL=http://localhost:3000 npm run smoke
```

Source layout:

```
src/
  server.mjs              MCP server setup + tool registration
  session.mjs             Browser + baseline store per MCP session
  config.mjs              Env-var driven config
  baselines/store.mjs     Filesystem baseline storage
  diff/pixelmatch.mjs     PNG diff wrapper
  driver/playwright.mjs   Playwright session management
  tools/                  One file per MCP tool
bin/crucible-mcp.mjs      Stdio entry point
docs/                     Design docs (start here for context)
templates/                Orchestrator-facing QA prompt templates
```

---

## Roadmap

See [`docs/design.md`](./docs/design.md) for the full version plan. TL;DR:

- **v0.1 (done)** — Eyes Only: 7 MCP tools, validated end-to-end against a real agent QA pipeline
- **v0.2** — Harness: Docker-based `boot_project` / `teardown_project`, YAML adapter format
- **v0.3** — Agentic QA: parallel isolation, reusable QA skills
- **v1.0** — Second consumer onboarded, adapter format frozen, npm publish

---

## Decisions & history

The build-first-document-after log lives in [`DECISIONS.md`](./DECISIONS.md). Architectural decisions and trade-offs are in [`docs/design.md`](./docs/design.md). Regression-pipeline operational details are in [`docs/regression-qa.md`](./docs/regression-qa.md).

## License

MIT — see [`LICENSE`](./LICENSE).
