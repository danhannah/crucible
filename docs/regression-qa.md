# Regression QA Pipeline

> Operational design for Crucible's regression sweep — when it runs, how it handles drift, what evidence it produces, and how baselines are maintained.

*Parent: [design.md](./design.md)*
*Created: 2026-04-16*

---

## Overview

The regression QA agent sweeps all stored baselines for a project to catch unintended visual drift. It runs alongside (not instead of) the feature QA agent. Where feature QA verifies "does the new thing work?", regression QA verifies "did the new thing break anything else?"

The baseline store IS the regression suite — `list_baselines` returns everything the agent needs to check. No manual test list to maintain.

## Trigger Policy

**Decision: Sequential — feature QA first, then regression.**

The pipeline runs in this order:

1. **Feature QA agent** runs against the PR branch test-env
2. Feature QA passes → orchestrator reviews the report and **approves updated baselines**
3. **Regression QA agent** runs against the same test-env, now with fresh baselines
4. Both reports feed the orchestrator's merge/fix decision

This eliminates the "intentional vs. unintentional drift" problem entirely. By the time regression runs, all baselines are current. Any drift regression finds is a real regression — no ambiguity, no classification step.

The trade-off is wall time: regression waits for feature QA + baseline approval (~2-5 min). Worth it — a few minutes of testing saves hours of rework.

### Scaling Strategy

As the baseline count grows (15-20+), a single regression agent becomes slow and risks context window bloat from accumulated screenshots. The solution is **sharding**:

- The regression prompt accepts an optional `baselines` list parameter
- If omitted, the agent discovers all baselines via `list_baselines`
- If provided, it only checks those baselines
- The orchestrator shards by splitting the full baseline list across N agents
- Target: ~10-15 baselines per agent (tuned by context window pressure, not time)

Defer building the sharding orchestration until you hit the pain point. Design the template to accept the parameter now.

### Manual Triggers

Two skills for ad-hoc use:

- **`/qa-regression`** — boots test-env if needed, runs regression sweep against current state, reports back. Good for post-deploy verification or confidence checks.
- **`/qa-feature`** — takes a PR number or branch name, boots the branch test-env, runs feature QA, reports back. Good for re-running QA after fixes.

## Drift Semantics

**Decision: No drift classification needed — baselines are always current when regression runs.**

The sequential pipeline (feature QA → approve baselines → regression) means the regression agent never encounters intentional drift. By the time it runs, the orchestrator has already approved any baseline updates that the feature change required.

This makes the regression agent's logic dead simple: **does everything match? Yes or no.** No nuance, no "known-affected baselines" hint list, no classification step. Any diff that exceeds tolerance is a real regression.

### Why This Works

- Feature QA catches whether the new thing works correctly
- The orchestrator reviews feature QA's report and approves baseline updates for pages that intentionally changed
- Regression QA then verifies that nothing *else* broke — with a clean set of baselines that already reflect the approved changes

### Edge Case: Cascading Visual Changes

A feature change might affect pages that weren't in the feature QA's scope. For example, a global CSS change to font size would affect every baselined page. In this case:

- Feature QA passes (the targeted change looks correct)
- Orchestrator approves baselines for the pages feature QA checked
- Regression finds drift on OTHER pages that weren't in feature QA's scope
- Regression reports ISSUES_FOUND — orchestrator triages: is this the expected cascade, or an actual bug?
- If expected cascade: orchestrator approves those baselines too, re-runs regression
- If bug: orchestrator fires a fix agent

This is the one scenario where regression might need a second pass. Acceptable — it only happens with broad visual changes.

## Baseline Hygiene

Baselines are maintained as part of the pipeline flow, not as a separate maintenance task.

### When Baselines Get Updated

- **During feature QA:** The feature QA agent identifies pages that changed. The orchestrator approves updated baselines before regression runs.
- **During regression (cascade):** If regression finds expected drift on pages outside feature QA's scope (e.g., global CSS change), the orchestrator approves those too and re-runs.
- **On demand:** `/qa-regression` can be run manually to verify baseline freshness at any time.

### Staleness Detection

A baseline is stale when it no longer matches the current state of the app on `main`. The regression agent detects this automatically — any baseline that fails comparison on a clean `main` build is stale by definition.

**Recovery:** Run regression against main, identify which baselines fail, re-baseline them.

### Retention

- Baselines for pages that still exist: keep indefinitely
- Baselines for pages that were removed: prune when detected (regression agent can't navigate to the URL → report as "unreachable" → orchestrator deletes)
- No automatic expiry — baselines are cheap (PNGs on disk)

## Test Environment

**Decision: Always boot a fresh test-env. Never reuse long-running instances.**

Fresh builds guarantee current code + clean seed data. Long-running containers run stale code — any commits since boot are invisible to the QA agent.

### Seed Data Dependency

Baselines assume deterministic seed data. The test-env should boot with the same fixtures every time. As long as seed fixtures don't change, baselines remain valid.

If seed data changes (new fixtures, modified content), ALL baselines will drift and need re-approval. This is expected and correct — the regression agent will flag it, the orchestrator approves the batch.

## Dynamic Content Masking

**Decision: Mask dynamic text content via `run_script` before screenshotting. Never mask structural elements.**

Relative timestamps ("3 days ago" vs "6 hours ago") cause ~3-4% pixel drift on every authenticated baseline. This is a systemic false positive — the seed data has fixed `created_at` dates, but the UI renders relative timestamps that change with wall-clock time.

### Masking Rules

1. **Only mask text content** — replace the text string, never hide/remove/resize elements
2. **Apply after page load, before screenshot** — via `run_script`
3. **Document every mask in the report** — the "Masks Applied" section ensures the orchestrator knows exactly what was hidden
4. **If unsure, don't mask** — let it fail and report it. False negatives (missed regressions) are worse than false positives (noisy reports)

### What Masking Preserves

Masking timestamps still catches:
- Element missing or mispositioned (layout shift = pixel diff)
- Wrong font, size, or color (style properties aren't masked)
- Container breaking layout (structural change)
- Element added or removed (structural change)

The only thing hidden is "did the exact time text change" — which is the one thing that's expected to change.

### Alternatives Considered

- **Freezing `Date.now()`** — risks breaking other time-dependent UI behavior (animations, debouncing, polling). DOM text masking is more surgical.
- **Regenerating timestamps to `now()` at boot** — timestamps drift within a single run (an annotation "1 minute ago" becomes "3 minutes ago" by the time the agent reaches the 3rd baseline). Less deterministic than masking.

## Evidence and Reporting

### On PASS

Lightweight PR comment — no screenshot gallery. Feature QA already provides the detailed visual evidence. Regression's PASS is a confidence stamp:

```
## Regression QA — PASS
- **Baselines checked:** N/N
- **All match within tolerance**
- **No unexpected drift detected**
```

Posted as a PR comment alongside the feature QA evidence. Short, scannable, sufficient.

### On ISSUES_FOUND

Report to orchestrator only — no PR comment (same policy as feature QA). Evidence includes:

- Which baseline(s) drifted
- Diff score for each
- Screenshot of current state (file path)
- The baseline it was compared against

The orchestrator triages: real bug → fire fix agent, or expected cascade → approve baselines and re-run.

### On NEEDS_HUMAN

When the agent can't determine if drift is intentional or a regression. Escalation path: orchestrator presents the regression report (with screenshots) to the human for classification.

### QA Report Format

```markdown
## Verdict: PASS | ISSUES_FOUND | NEEDS_HUMAN

## Baseline Results
| Spec | URL | Match Score | Verdict | Notes |
|------|-----|-------------|---------|-------|
| homepage | http://localhost:3001/ | 1.000000 | pass | |
| sample-doc | http://localhost:3001/docs/... | 0.999998 | pass | |

## Findings (if any)
### [Finding — severity: high/medium/low]
- **What:** [description of the regression]
- **Where:** [page/URL]
- **Evidence:** [screenshot path, diff score]
- **Baseline spec:** [which baseline drifted]

## Coverage
- **Baselines checked:** [N of M]
- **Baselines skipped:** [any unreachable and why]
```

## Out of Scope

- Approving baselines (orchestrator responsibility)
- Fixing regressions (fix agent's job)
- Running unit or integration tests (vitest/jest own that layer)
- Multi-project regression (one project per run for v1)
