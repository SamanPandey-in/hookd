// Command-line surface: parse argv, validate, and dispatch. Kept free of I/O
// side effects beyond printing help so it stays unit-testable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runListen } from './listen.js';

const DEFAULT_API = 'http://localhost:8099';

function version() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const USAGE = `hookd — forward captured webhooks to a local URL

Usage:
  npx hookd listen <endpointId> --forward <localURL> [options]

Options:
  --forward <url>     Local URL to deliver each captured event to (required)
  --resign            Re-sign the forwarded request with a fresh signature so
                      your handler's verification passes (needs --secret)
  --key <whk_...>     hookd API key (or env HOOKD_API_KEY)
  --secret <s>        Signing secret, used only with --resign (or env
                      HOOKD_SIGNING_SECRET). Never stored or logged.
  --provider <name>   Force the provider for re-signing: stripe | github |
                      shopify | razorpay | standard_webhooks (auto-detected
                      from the captured signature headers when omitted)
  --api <url>         hookd API base URL (or env HOOKD_API_URL)
                      [default: ${DEFAULT_API}]
  -h, --help          Show this help
  -v, --version       Show version

Environment:
  HOOKD_API_KEY         API key, if --key is not passed
  HOOKD_API_URL         API base URL, if --api is not passed
  HOOKD_SIGNING_SECRET  Signing secret for --resign, if --secret is not passed
  NO_COLOR              Disable colored output

Examples:
  npx hookd listen ep_123 --forward http://localhost:3000/webhooks
  HOOKD_API_KEY=whk_live_… npx hookd listen ep_123 \\
    --forward http://localhost:4000 --resign --secret whsec_…
`;

/**
 * Parse the `listen` subcommand arguments.
 * @returns {{endpointId: string, forward: string, resign: boolean, key?: string,
 *            secret?: string, provider?: string, api: string}}
 */
export function parseListenArgs(args) {
  const opts = { resign: false, api: process.env.HOOKD_API_URL || DEFAULT_API };
  const positional = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    switch (a) {
      case '--forward':
      case '-f':
        opts.forward = args[++i];
        break;
      case '--resign':
        opts.resign = true;
        break;
      case '--key':
        opts.key = args[++i];
        break;
      case '--secret':
        opts.secret = args[++i];
        break;
      case '--provider':
        opts.provider = args[++i];
        break;
      case '--api':
        opts.api = args[++i];
        break;
      default:
        if (a && a.startsWith('--') && a.includes('=')) {
          // Support --flag=value form.
          const eq = a.indexOf('=');
          const name = a.slice(0, eq);
          const value = a.slice(eq + 1);
          args.splice(i, 1, name, value);
          i -= 1;
        } else if (a && a.startsWith('-')) {
          throw new Error(`unknown option: ${a}`);
        } else {
          positional.push(a);
        }
    }
  }

  opts.endpointId = positional[0];
  opts.key = opts.key || process.env.HOOKD_API_KEY;
  opts.secret = opts.secret || process.env.HOOKD_SIGNING_SECRET;

  if (!opts.endpointId) throw new Error('missing <endpointId>. See `hookd --help`.');
  if (!opts.forward) throw new Error('missing --forward <localURL>. See `hookd --help`.');
  if (!opts.key) throw new Error('missing API key. Pass --key or set HOOKD_API_KEY.');
  if (opts.provider && !['stripe', 'github', 'shopify', 'razorpay', 'standard_webhooks'].includes(opts.provider)) {
    throw new Error(`unsupported --provider "${opts.provider}". Use one of: stripe, github, shopify, razorpay, standard_webhooks.`);
  }
  return opts;
}

/**
 * Entry point. Returns an exit code.
 * @param {string[]} argv  process.argv.slice(2)
 */
export async function main(argv) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (argv.includes('-v') || argv.includes('--version')) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const [cmd, ...rest] = argv;
  if (cmd !== 'listen') {
    process.stderr.write(`unknown command: ${cmd}\n\n${USAGE}`);
    return 1;
  }

  const opts = parseListenArgs(rest);

  // Clean Ctrl-C: first SIGINT aborts the loop (graceful); a second forces exit.
  const controller = new AbortController();
  let forced = false;
  const onSig = () => {
    if (forced) process.exit(130);
    forced = true;
    process.stderr.write('\nhookd shutting down… (press Ctrl-C again to force)\n');
    controller.abort();
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  try {
    return await runListen({
      endpointId: opts.endpointId,
      forwardUrl: opts.forward,
      api: opts.api,
      key: opts.key,
      resign: opts.resign,
      secret: opts.secret || null,
      provider: opts.provider || null,
      signal: controller.signal,
    });
  } finally {
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
  }
}
