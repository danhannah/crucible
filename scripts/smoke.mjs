#!/usr/bin/env node
// Smoke test for Crucible — drives the eyes flow against any reachable URL.
//
// Set CRUCIBLE_SMOKE_URL to the app you want to verify. Defaults to
// http://127.0.0.1:3000 — change it via env var, not by editing this file:
//
//   CRUCIBLE_SMOKE_URL=http://127.0.0.1:54321/docs/sample node scripts/smoke.mjs
//
// On first run, writes a baseline at:
//   ~/.crucible/baselines/<project>/<spec>/{baseline.png,meta.json}
//
// On subsequent runs, diffs the new screenshot against the stored baseline
// and prints the match score.

import { createSession } from '../src/session.mjs';

const targetUrl = process.env.CRUCIBLE_SMOKE_URL || 'http://127.0.0.1:3000';
const PROJECT = process.env.CRUCIBLE_SMOKE_PROJECT || 'crucible-smoke';
const SPEC = process.env.CRUCIBLE_SMOKE_SPEC || 'home';

function log(msg) {
  process.stderr.write(`[crucible:smoke] ${msg}\n`);
}

async function main() {
  log(`target: ${targetUrl}`);
  log(`baseline: ${PROJECT}/${SPEC}`);

  try {
    const res = await fetch(targetUrl, { method: 'HEAD' }).catch(() => fetch(targetUrl));
    if (!res.ok && res.status !== 405) {
      log(`warning: target responded ${res.status} — continuing anyway`);
    }
  } catch (err) {
    log(`target unreachable at ${targetUrl}: ${err.message}`);
    log(`set CRUCIBLE_SMOKE_URL to point at a running app`);
    process.exit(2);
  }

  const session = createSession();
  try {
    log('navigating...');
    const nav = await session.driver.navigate(targetUrl, { waitUntil: 'networkidle' });
    log(`navigated -> ${nav.url} (status ${nav.status})`);
    if (!nav.status || nav.status >= 400) {
      throw new Error(`bad nav status: ${nav.status}`);
    }

    log('screenshotting...');
    const { png, viewport, url } = await session.driver.screenshotPage({ fullPage: true });
    log(`captured ${png.length} bytes @ ${viewport?.width}x${viewport?.height}`);
    session.lastScreenshot = { png, viewport, url, capturedAt: new Date().toISOString() };

    const existing = await session.baselines.get(PROJECT, SPEC);
    if (existing) {
      log('baseline exists — comparing against it');
      const { diffPngs } = await import('../src/diff/pixelmatch.mjs');
      const diff = await diffPngs(png, existing.png);
      log(
        `matchScore=${diff.matchScore.toFixed(6)} diffPixels=${diff.diffPixels}/${diff.totalPixels}`,
      );
    } else {
      log('no existing baseline — writing first one');
      const { pngPath, metaPath } = await session.baselines.put(PROJECT, SPEC, {
        png,
        meta: {
          capturedAt: new Date().toISOString(),
          url,
          viewport,
          browser: session.config.browser,
          approvedBy: 'crucible-smoke',
          note: `first baseline from smoke.mjs against ${targetUrl}`,
        },
      });
      log(`baseline written:`);
      log(`  ${pngPath}`);
      log(`  ${metaPath}`);
    }

    log('smoke OK');
  } finally {
    await session.shutdown();
  }
}

main().catch((err) => {
  log(`FATAL: ${err?.stack || err}`);
  process.exit(1);
});
