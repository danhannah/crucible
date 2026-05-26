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
| `CRUCIBLE_TEST_ENV_URL` | `http://127.0.0.1:54321` | Default URL used when none is passed. Most agents pass URLs explicitly to `navigate`. |
| `CRUCIBLE_BASELINE_ROOT` | `~/.crucible/baselines` | Where baselines are stored. |
| `CRUCIBLE_SMOKE_URL` | `http://127.0.0.1:3000` | URL the `npm run smoke` script targets. |
| `CRUCIBLE_SMOKE_PROJECT` | `crucible-smoke` | Project name for the smoke baseline. |
| `CRUCIBLE_SMOKE_SPEC` | `home` | Spec name for the smoke baseline. |

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
