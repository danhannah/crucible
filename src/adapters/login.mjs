import { chromium } from 'playwright';
import { writeStorageState } from './storage-state.mjs';

/**
 * Open a non-headless browser at the adapter's URL and wait for the user to
 * complete login interactively (typically SSO + 2FA). Captures the resulting
 * `storageState` (cookies + localStorage) to disk.
 *
 * Termination signal: SIGINT (Ctrl+C in the launching terminal). The browser
 * stays alive until the signal arrives so `context.storageState()` can be
 * read while the page is still open. The browser-close event is a fallback
 * for users who close the window directly — state is captured on every
 * main-frame navigation so the most recent snapshot is always available.
 *
 * Note: this hooks process-level SIGINT by default. Long-lived host processes
 * that don't want their own SIGINT handler displaced should pass
 * `installSignalHandler: false` and resolve a signal of their own choosing.
 *
 * Returns the path the state was written to.
 */
export async function captureStorageState({
  adapter,
  log = (msg) => console.error(`[crucible login] ${msg}`),
  installSignalHandler = true,
} = {}) {
  if (!adapter) throw new Error('adapter is required');
  if (!adapter.url) throw new Error('adapter.url is required');
  if (!adapter.storageStatePath) throw new Error('adapter.storageStatePath is required (cookie-handoff strategy?)');

  log(`launching non-headless chromium at ${adapter.url}`);
  log(`complete login in the browser, then press Ctrl+C in this terminal to save.`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let lastSnapshot = null;
  const snapshotState = async () => {
    try {
      lastSnapshot = await context.storageState();
    } catch {
      // Context closed mid-snapshot — keep the previous good value.
    }
  };

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) snapshotState();
  });

  try {
    await page.goto(adapter.url, { waitUntil: 'load', timeout: 60_000 });
  } catch (err) {
    log(`initial navigation failed (${err.message}) — proceeding anyway; you can navigate manually.`);
  }

  await snapshotState();

  await new Promise((resolve) => {
    let resolved = false;
    const finish = (reason) => {
      if (!resolved) {
        resolved = true;
        log(`captured (${reason}) — closing browser.`);
        resolve();
      }
    };
    if (installSignalHandler) {
      process.once('SIGINT', () => finish('SIGINT'));
    }
    context.on('close', () => finish('context-closed'));
    browser.on('disconnected', () => finish('browser-disconnected'));
  });

  // One last snapshot attempt while context might still be alive.
  await snapshotState();

  try { await browser.close(); } catch {}

  if (!lastSnapshot) {
    throw new Error('failed to capture storageState — no successful snapshot taken. Try again.');
  }

  await writeStorageState(adapter.storageStatePath, lastSnapshot);
  log(`wrote storageState to ${adapter.storageStatePath}`);
  return adapter.storageStatePath;
}
