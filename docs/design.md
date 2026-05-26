# Crucible — Project-Agnostic Test Harness & Visual Regression MCP

> **One-line pitch:** An agentic QA framework that gives AI agents *eyes*. Crucible provides visual verification, baseline management, and repeatable test environments — while agents use your app's own MCP tools (or generic browser tools as a fallback) for interaction. The agent is the test runner.

*Status: Refining — v0.1 "Eyes Only" validated end-to-end.*
*Created: 2026-04-11*
*Last major update: 2026-04-13 — reframed from "Playwright wrapper + spec runner" to "visual verification layer for agentic QA"*
*Extracted to public repo: 2026-05-26*

---

## Overview

### What Is This?

Crucible is an **agentic QA framework** — it gives AI agents the ability to *see* what they changed and verify it visually. It combines three concerns:

1. **Eyes** — Headless browser screenshots, pixel-level diffs against stored baselines, baseline approval workflow. The agent can see the UI and compare it against known-good states.
2. **Harness** — Docker-compose orchestration, deterministic seed layer, parallel isolation. The agent can boot a known-good environment every time, the same way. *(v0.2 — not yet shipped.)*
3. **Generic browser interaction (fallback)** — Navigate, click, type, scroll. Available for apps that don't have their own MCP tools, but positioned as training wheels, not the primary interaction model.

**The key insight:** Crucible does NOT try to be a Playwright wrapper. The best agentic QA happens when agents interact with apps through **domain-specific MCP tools** — your app's `create_annotation`, not `click at (x, y)`. Crucible provides the visual verification layer; your app's own tools provide the semantic interaction. For apps without MCP tools, Crucible's generic browser tools are a workable fallback.

This is a fundamentally different approach from existing AI testing tools, which focus on "AI writes Playwright scripts faster." In Crucible's model, the **agent is the test runner** — it uses judgment, explores, and decides what to verify. No scripted steps, no brittle selectors, no predetermined assertions.

### Why It Exists

Agents can write code and run tests, but they're **blind to UI**. Every feature pipeline ends at the same handoff: *"…and now the human visually QAs it and merges."* That's the bottleneck.

Existing AI testing tools don't solve this — they help humans write scripts faster (Momentic, Carbonate, QA Wolf) or do visual diffing without agent integration (Applitools, Percy). Nobody has built the combination of:

- **App-specific MCP tools** for semantically meaningful interaction (not blind pixel clicking)
- **Visual verification** with baseline management (screenshot + diff + approval)
- **Agent judgment** for exploration, prioritization, and pass/fail decisions

The market is full of "AI helps you write tests faster." It's empty on "AI autonomously QAs using domain-specific tools + visual verification." That's the gap Crucible fills.

Crucible closes the loop: implementation agent opens a PR → Crucible boots a clean environment → the QA agent uses the app's own MCP tools to interact and Crucible's eyes to verify → returns pass/fail with visual evidence → orchestrator merges or fires a fix agent.

### Who Is It For?

- **AI coding agents** running feature pipelines that need to verify UI changes — the primary audience
- **Developers** who want agentic QA for their web projects without writing Playwright scripts
- **Apps with MCP tools** — Crucible is most powerful here. The agent uses your app's semantic tools for interaction and Crucible for visual verification
- **Apps without MCP tools** — Crucible's generic browser fallback tools still work. Lower fidelity, but zero setup beyond a URL

### Target Use Cases

| Project | How Crucible + App MCP Tools Work Together |
|---------|-------------------------------------------|
| App with rich MCP tools | Agent uses domain tools (e.g. `create_annotation`, `submit_review`) to interact, Crucible to screenshot and verify the resulting UI |
| Canvas / drawing app | Agent uses app tools to configure state, Crucible to verify 2D/3D canvas rendering matches baselines |
| Any web app with MCP tools | Agent uses domain tools for semantic interaction + Crucible for visual verification. Best experience. |
| Any web app without MCP tools | Agent uses Crucible's generic browser tools (click, type) + Crucible's eyes. Works out of the box with just a URL. |

### Business Model

**Open-source-first, internal-pipeline-driven.** Crucible is built to unblock real agent pipelines (Foundry, Autri, work projects). MIT licensed under `@claymore-dev/crucible` so any team can drop it in.

No direct monetization planned for v1. Long-term, hosted baseline storage + team-shared approval workflow is a plausible paid tier.

---

## AI Interface Architecture

This section is the whole point of the project.

### The Interaction Model — Three Layers

Agentic QA involves three layers of tooling. Crucible's design is built around where each layer's boundary falls:

| Layer | What It Does | Who Owns It | Examples |
|-------|-------------|-------------|---------|
| **Eyes (visual verification)** | Screenshot, diff, baseline management, verdicts | **Crucible (core)** | `screenshot_page`, `compare_screenshots`, `approve_baseline` |
| **Harness (environment)** | Boot containerized env, seed, teardown, healthcheck | **Crucible (core)** | `boot_project`, `teardown_project`, `seed` |
| **Generic browser interaction** | Navigate, click, type, scroll, wait | **Crucible (fallback)** | `navigate`, `click`, `type`, `scroll` |
| **Domain-specific interaction** | Semantically meaningful app actions | **The app's own MCP tools** | `create_annotation`, `submit_review` |

**The principle:** Crucible is most powerful when agents interact through domain-specific MCP tools — they operate at the semantic level of the application, not the pixel level. An agent that calls `create_annotation("This needs review")` understands what it's doing in a way that `click(452, 318)` never can.

But not every app has MCP tools. Crucible's generic browser interaction layer (navigate, click, type, scroll) exists as a **fallback** — training wheels that make Crucible useful on day one for any web app with a URL. As apps mature into their own MCP tools, the agent naturally shifts to those.

### App Maturity Spectrum

| App Maturity | Interaction Method | QA Fidelity | Setup Required |
|-------------|-------------------|-------------|----------------|
| **Has rich MCP tools** | Agent uses app's own MCP tools | Highest — semantic interaction, the agent understands what it's doing | App MCP server + Crucible |
| **Has some MCP tools** | Mix of app tools + Crucible browser fallback | High — semantic where possible, pixel-level where not | Partial app MCP + Crucible |
| **No MCP tools, just a URL** | Crucible's generic browser tools (click, type, scroll) | Moderate — works but fragile, selector-dependent | Crucible only |

### MCP Tool Surface

**Eyes (core — always available):**

| Tool | Purpose |
|------|---------|
| `navigate` | Go to a URL. Launches browser on first call. Returns final URL + status. |
| `screenshot_page` | Full-page or viewport PNG screenshot. Cached in-session for subsequent compare. |
| `compare_screenshots` | Diff a screenshot against a stored baseline. Returns match score + verdict. |
| `approve_baseline` | Write current screenshot as the baseline for a project/spec. |
| `list_baselines` | List baselines for a project/spec. |

**Generic browser interaction (fallback — for apps without their own MCP tools):**

| Tool | Purpose |
|------|---------|
| `click` | Click an element by CSS selector. |
| `run_script` | Run arbitrary JS via `page.evaluate` — set localStorage, inject CSS, read DOM. |

**Coming in v0.2 (harness layer):**

| Tool | Purpose |
|------|---------|
| `boot_project` | Boot a project by adapter name. Returns handle + entry URL. |
| `teardown_project` | Clean up containers, networks, volumes for a handle. |
| `seed` | Run the project's seed command inside the harnessed container. |
| `healthcheck` | Probe the harnessed app until it responds or times out. |

**Not in Crucible — belongs to the app:**

Domain-specific tools like `create_annotation`, `submit_review`, `add_to_cart`, `create_user` — these are semantically meaningful actions that only the app knows about. Crucible can't and shouldn't try to own these. Apps that want the best agentic QA experience should expose their own MCP tools for the actions agents need to perform during testing.

### Why This Matters

Traditional visual regression is expensive: someone writes Playwright scripts, maintains them, babysits CI. AI-assisted testing (Momentic, Carbonate) just makes script *authoring* faster — the model is still scripted, still brittle.

Agentic QA with Crucible is fundamentally different: the implementation agent commits its work, then a **separate QA agent** verifies it — independent verification, not self-review. The QA agent uses domain-specific tools to interact with the app at a semantic level, uses Crucible to see the result, and applies judgment to decide whether it looks right. Meanwhile, a parallel regression agent sweeps all existing baselines for drift. No scripts to maintain. No selectors to update. The agents adapt.

---

## Agentic QA Pipeline

This is the end-to-end flow that Crucible enables. A separate QA agent verifies the implementation agent's work — independent verification, not self-review.

### The Pipeline

1. **Orchestrator agent** receives a feature request
2. Fires **implementation sub-agent** → writes code, runs unit tests, commits
3. Fires **two QA sub-agents in parallel:**
   - **Feature QA agent** — focused on the specific change. Gets a prompt template with success criteria, what changed, and targeted pages. Verifies the feature works as intended.
   - **Regression QA agent** — focused on everything else. Discovers all existing baselines via `list_baselines` and sweeps them for drift. No manual test list — the baseline store IS the regression suite.
4. Both QA agents use app MCP tools + Crucible eyes to verify
5. Both return structured markdown reports → orchestrator decides: merge, or fire a fix agent
6. If issues found: fix agent makes changes → QA agents run again → loop until clean
7. **Escalation threshold**: if 3 iterations produce no progress, escalate to human (`NEEDS_HUMAN` verdict)

See [`templates/feature-qa.md`](../templates/feature-qa.md) and [`templates/regression-qa.md`](../templates/regression-qa.md) for the orchestrator-facing prompt templates.

### QA Report Structure

Both QA agents return this format to the orchestrator. Markdown — LLMs read/write it natively, humans can scan it directly, no JSON parsing needed.

```markdown
## Verdict: PASS | ISSUES_FOUND | NEEDS_HUMAN

## Findings
### [Finding 1 — severity: high/medium/low]
- **What:** [description of the issue]
- **Where:** [page/component/URL]
- **Evidence:** [screenshot path, baseline path, diff score]
- **Suggested fix:** [if the agent has an opinion]

## Baselines
- **Updated:** [baselines intentionally updated — agent judged the change as correct]
- **New:** [new baselines proposed for new pages/components]
- **Failed:** [baselines where the diff exceeded tolerance]

## Coverage
- **Pages visited:** [list of URLs]
- **MCP tools used:** [app tools + Crucible tools invoked]
- **Areas not checked:** [anything the agent couldn't reach or chose to skip]
```

**Verdicts:**
- **PASS** — all success criteria met, no regressions detected, baselines match or intentionally updated
- **ISSUES_FOUND** — specific problems identified with evidence. Orchestrator fires fix agents per finding.
- **NEEDS_HUMAN** — agent isn't confident enough to pass or fail. Better to escalate than silently pass something wrong.

**Retry loop:** orchestrator reads findings → fires fix agent with finding details as context → fix agent commits → QA agents run again. Max 3 iterations before escalating to human.

See [`regression-qa.md`](./regression-qa.md) for the regression pipeline's operational design (when it runs, drift semantics, masking rules).

---

## Scope & Roadmap

### v0.1 — "Eyes Only" ✅

- 7 MCP tools: `navigate`, `screenshot_page`, `compare_screenshots`, `approve_baseline`, `list_baselines`, `run_script`, `click`
- Hardcoded for a single test-env URL, no adapter format
- **Validated 2026-04-13**: Full eyes flow working end-to-end via live MCP. Pixel-deterministic — 0 diff pixels across consecutive screenshots of the same page.

### v0.2 — "Harness + Fallback Browser"

- E2 (Harness MVP): `boot_project`, `teardown_project`, `seed`, `healthcheck`
- E4 (Adapter format): YAML project adapter schema
- Generic browser fallback tools: `type`, `scroll`, `wait_for`
- **Success criterion**: `boot_project("my-app")` → harnessed instance → agent uses app MCP tools to interact + Crucible eyes to verify → `teardown_project`

### v0.3 — "Agentic QA"

- E6 (Parallel isolation): multiple agents can run Crucible simultaneously
- E7 (QA Prompt/Skill): a reusable prompt template or Claude Code skill that orchestrates the full QA flow — "verify this branch against these baselines using available MCP tools"
- **Success criterion**: agent receives a QA prompt, autonomously explores using app MCP tools + Crucible eyes, and produces a structured pass/fail report with visual evidence

### v1.0 — "Second Consumer"

- Onboard a second project beyond the first reference consumer
- Freeze the adapter format
- Publish `@claymore-dev/crucible` on npm
- **Success criterion**: a second project's first agentic QA run produces useful results with no changes to Crucible core

### Non-Goals (v1)

- **Not a unit test framework** — vitest/jest/etc. own that layer
- **Not a Playwright replacement** — Crucible exposes browser tools as a *fallback*, not as a primary interface. Apps should build their own MCP tools for the best experience.
- **Not a script runner** — no deterministic step-by-step spec execution. The agent uses judgment, not a script.
- **Not a CI service** — it's invoked locally by agents; CI integration is an optional extension
- **Not a visual design tool** — no Figma-style compare, just pixel diffs
- **Not cross-device testing** — desktop browsers only for v1 (mobile emulation is a fast-follow)

---

## Competitive Landscape

Researched 2026-04-13. The agentic QA space is crowded with "AI writes scripts faster" but almost empty on "AI autonomously explores and finds issues."

| Tool / Category | What It Does | Agentic? | Visual? | MCP-Aware? |
|----------------|-------------|----------|---------|------------|
| **QA Wolf, Momentic, Carbonate** | AI translates natural language → Playwright scripts | No — AI is the *author*, not the *tester* | No | No |
| **Applitools, Percy, Chromatic** | Visual regression diffing | No — verification layer only, no interaction | Yes | No |
| **Octomind** | AI discovers and generates e2e tests by crawling | Partial — outputs scripted tests | No | No |
| **LaVague, BrowserUse** | LLM-driven browser agents (see page, decide action) | Yes — but generic browser-level, no domain tools | Screenshot-based | No |
| **Playwright MCP** (Microsoft) | MCP server wrapping Playwright browser control | Infrastructure only | No | Yes |
| **Crucible** | Visual verification + baseline management + harness, designed for agents using app-specific MCP tools | **Yes — agent-as-test-runner with domain-tool interaction** | **Yes — core** | **Yes — native** |

**The gap Crucible fills:** No existing tool combines app-specific MCP tools for semantic interaction + visual verification + agent judgment in an autonomous QA loop. The pieces exist separately; nobody has composed them.

---

## Open Questions

- **Report format portability:** The QA report is markdown now. Should it also have a structured JSON representation for programmatic consumption by orchestrators? Or is markdown parsing good enough?
- **Baseline approval UX for humans:** When the QA agent proposes baseline updates, how does the human review them? Just look at the PNGs on disk? A diff viewer? This matters once baselines start accumulating.
- **Multi-page QA sessions:** How does the agent decide which pages to visit during exploratory QA? Does the prompt template need to list known routes, or can the agent discover them from navigation/sitemap?

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Renamed from **Lookout** to **Crucible** | On-brand with Foundry/Anvil metalworking lineup; "crucible" = severe test |
| 2026-04-11 | Merged "orchestration harness" with visual regression into one project | Two halves of the same problem — eyes *and* a repeatable environment |
| 2026-04-11 | MCP-native from day one, not CLI-first | Agents are the primary users. CLI is a fallback for humans. |
| 2026-04-11 | Docker-based harness, not host-native | Reproducibility and parallel isolation matter more than 30-60s cold-start cost |
| 2026-04-11 | Baselines stored on local filesystem, not cloud | Simplicity for v1; local-first matches the Claymore stack |
| 2026-04-13 | Reframed from "test harness + visual regression" to "agentic QA framework" | Market research showed the space is full of "AI writes scripts faster" but empty on "AI autonomously QAs using domain tools + visual verification" |
| 2026-04-13 | Three-layer interaction model: eyes (core) + harness (core) + generic browser (fallback) | Crucible is most powerful when apps have their own MCP tools. But requiring app MCP tools kills adoption. Generic browser tools serve as training wheels. |
| 2026-04-13 | Removed scripted spec runner from core architecture | The agent receives a QA prompt + success criteria and uses judgment. No deterministic step-by-step execution. |
| 2026-04-13 | Two-agent QA model: feature QA + regression QA in parallel | Separating concerns keeps scope manageable. |
| 2026-04-13 | Regression suite derived from baseline store, not manually maintained | `list_baselines` returns all baselines — that IS the regression suite. |
| 2026-04-13 | Separate QA agent verifies implementation agent's work | Independent verification is more trustworthy than self-review. |
| 2026-04-13 | Structured QA report in markdown with PASS/ISSUES_FOUND/NEEDS_HUMAN verdicts | Markdown because LLMs read/write it natively and humans can scan it. |
| 2026-04-13 | 3-iteration retry limit before human escalation | Autonomous fix loops need a circuit breaker. |
| 2026-04-13 | Baseline drift: QA agent can propose updates | Agent judges "changed but correct" → proposes baseline update in report. Orchestrator/human approves batch. |
| 2026-04-13 | Screenshot output: save to file, return path | Agents need to *see* to judge correctness. Save PNG to file, return path + metadata. No base64 in MCP response. |
| 2026-04-16 | Sequential feature-QA → regression-QA, not parallel | Eliminates drift classification — baselines are current by the time regression runs |
| 2026-05-26 | Extracted to public repo `danhannah94/crucible` | Real-world demand from work projects + Autri; time to make it generally usable |

---

## Epic Index

| Epic | Status | Summary |
|------|--------|---------|
| E1: Eyes MVP | **Done (v0.1)** | Screenshot + pixelmatch diff + baseline approval. 7 MCP tools, 26 tests, validated end-to-end. |
| E2: Harness MVP | Idea | Docker compose up/down + seed + healthcheck via `boot_project`/`teardown_project` |
| E3: MCP Tool Surface | Partially done | Eyes tools shipped in v0.1. Harness + fallback browser tools in v0.2. |
| E4: Project Adapter Format | Idea | YAML adapter schema + zod validation + loader |
| E5: ~~Spec Runner~~ → QA Prompt/Skill | Reframed | A reusable prompt template that gives an agent a QA objective + success criteria. The agent uses judgment, not a script. |
| E6: Parallel Isolation | Idea | COMPOSE_PROJECT_NAME + port offset + per-agent state dirs |
| E7: Generic Browser Fallback | Partially done | `click` and `run_script` shipped. `type`, `scroll`, `wait_for`, `get_dom` pending. |
