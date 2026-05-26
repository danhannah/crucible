#!/usr/bin/env node
import { runCli } from '../src/cli/index.mjs';

runCli().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    process.stderr.write(`[crucible] fatal: ${err?.stack || err}\n`);
    process.exit(1);
  },
);
