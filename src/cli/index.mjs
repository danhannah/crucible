import { runLogin } from './login.mjs';

const USAGE = `Usage: crucible <command> [options]

Commands:
  login --adapter=<name>   Drive interactive login for a cookie-handoff adapter
                           and save storageState to ~/.crucible/state/<name>.json

Options:
  -h, --help               Show this help

Environment:
  CRUCIBLE_ADAPTER         Default adapter name (overridden by --adapter)
  CRUCIBLE_<NAME>_URL      Per-adapter URL override
`;

export function parseArgs(argv) {
  const args = argv.slice(0);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    return { command: 'help' };
  }
  const command = args.shift();
  const flags = {};
  for (const tok of args) {
    if (tok === '-h' || tok === '--help') {
      flags.help = true;
      continue;
    }
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq > 0) {
        flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      } else {
        flags[tok.slice(2)] = true;
      }
      continue;
    }
    throw new Error(`unrecognized argument "${tok}"`);
  }
  return { command, flags };
}

export async function runCli(argv = process.argv.slice(2), {
  out = (msg) => process.stdout.write(msg + '\n'),
  err = (msg) => process.stderr.write(msg + '\n'),
  env = process.env,
} = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    err(`crucible: ${e.message}`);
    err(USAGE);
    return 2;
  }

  if (parsed.command === 'help') {
    out(USAGE);
    return 0;
  }

  if (parsed.flags?.help) {
    out(USAGE);
    return 0;
  }

  switch (parsed.command) {
    case 'login':
      return runLogin({ flags: parsed.flags, out, err, env });
    default:
      err(`crucible: unknown command "${parsed.command}"`);
      err(USAGE);
      return 2;
  }
}
