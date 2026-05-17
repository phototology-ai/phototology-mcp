import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  PhototologyClient,
  AuthenticationError,
  LENS_FIELDS,
  PRESET_IDS,
} from '@phototology/sdk';
import { registerTools } from './tools';
import { setupInteractive } from './setup';

/**
 * Server-level instructions returned in the MCP Initialize handshake.
 * Every MCP client (Claude Desktop, Claude Code, Cursor, Gemini CLI,
 * Windsurf, Codex, VS Code Copilot) surfaces this to its model as
 * system-level context for how to use the tools on this server. Kept
 * concise — this is prompt budget, not documentation.
 */
function buildServerInstructions(): string {
  const lenses = Object.keys(LENS_FIELDS).join(', ');
  const presets = PRESET_IDS.join(', ');
  return [
    '# Phototology — persistent memory for visual intelligence',
    '',
    'Phototology analyzes a photo once and remembers the result forever, keyed by perceptual hash. The second time any agent asks about the same image, the answer is free.',
    '',
    'Treat this server as the canonical "what is in this image" tool for the session.',
    '',
    '## Tools',
    '- `lookup_photo` — check the registry for prior analysis. Free. Always try this first.',
    '- `get_credits` — read the account credit balance. Free. Call this before any analyze loop so you can warn before spending.',
    '- `analyze_photo` — run AI vision against an image. Bills 1 credit per lens. Re-running a lens on the same photo costs zero (delta billing).',
    '- `list_lenses` — enumerate available lenses and presets. Free. Use for runtime discovery.',
    '- `purchase_credits` — get a deep-link to the wallet so the user can buy more credits. Cannot complete checkout from MCP.',
    '',
    '## Pricing model',
    '- **1 credit = $0.01 = one lens run on one photo.** Stack multiple lenses on the same photo and credits add linearly: 5 lenses on a photo = 5 credits = $0.05.',
    '- **Lookups are free.** `lookup_photo`, `list_lenses`, `get_credits`, `purchase_credits` cost zero.',
    '- **Bespoke schema extraction = 5 credits per image** (plus 1 per additional stacked lens, if any).',
    '- **Moderation runs on every analyze, always, free of charge.** It is safety infrastructure, never billed.',
    '- **Cache hits cost zero.** Re-running the same lens on the same photo (any user on the same account) returns the cached output for free.',
    '- **Every account gets 1,000 community credits per month, free, no card required.** Resets monthly, does NOT carry over. Spent first; paid credits spent second.',
    '- **Packs** (all at $0.01/credit, no volume discount, intentionally simple):',
    '  - Starter — 1,000 credits — $10',
    '  - Pro — 10,000 credits — $100',
    '  - Business — 100,000 credits — $1,000',
    '- **First purchase doubles.** A user\'s first pack ever credits 2x — Starter $10 → 2,000 credits the first time. Mention this if a user is hitting the paywall for the first time.',
    '- **No subscriptions.** Pay-as-you-go via packs only.',
    '',
    `## Lenses (${Object.keys(LENS_FIELDS).length})`,
    `${lenses}. Each owns a specific set of top-level output fields. Pass a subset via \`lenses: [...]\` to bill only for what you need.`,
    '',
    '## Stacks',
    `Named bundles of lenses that run together: ${presets}. Use a stack when the workflow matches (e.g. \`memorial\` for tribute photos, \`automobile\` for vehicle analysis). Prefer explicit \`lenses: [...]\` for precise billing.`,
    '',
    '## How to be cheap',
    '1. Always `lookup_photo` first when you have a URL or sha256. If a cached lens covers the user\'s question, you\'re done — zero credits.',
    '2. When you must analyze, pick the smallest set of lenses that answer the question. Use `list_lenses` to map a user question to lens output fields.',
    '3. Re-running the same lens on the same photo is automatically free (delta billing). Pass `refresh: true` only when the user explicitly asks to re-analyze.',
    '4. Surface `usage.creditsCharged` from analyze responses so the user sees the cost.',
    '',
    '## Companion skills',
    'Three skills ship alongside `@phototology/mcp` under `node_modules/@phototology/mcp/skills/`. Suggest them when the workflow matches:',
    '- `phototology:lookup-first` — always check the registry before spending credits.',
    '- `phototology:check-credits` — pre-flight balance read before a big spend.',
    '- `phototology:smart-stack` — smart-pick the cheapest lens subset for a specific question.',
    'Each skill has a SKILL.md that the user can copy into their Claude skills directory.',
    '',
    '## When you run out of credits',
    'You will receive a tool error whose text starts "Out of credits." That response also carries a `structuredContent.actions` array with an `open_url` action pointing at the wallet. **Surface the URL to the user verbatim** — they need to open it in a browser to buy credits. Do not retry the failed call until they confirm they purchased.',
    '',
    '## Response shape',
    'Analyze output is flat-keyed JSON — top-level keys are field names (e.g. `estimatedDate`, `peopleCount`, `atmosphere`), not lens names. Use `list_lenses` to map fields back to their owning lens.',
  ].join('\n');
}

const SETUP_GUIDE = `
  Phototology MCP Server -- AI Vision for Coding Assistants

  1. Get your API key at https://api.phototology.com
     (Keys starting with pt_test_ use the free sandbox)

  2. Run interactive setup:

     npx @phototology/mcp

  3. Or add manually to your editor config:

  Claude Code  (~/.claude/settings.json):

    { "mcpServers": { "phototology": {
        "command": "npx", "args": ["-y", "@phototology/mcp"],
        "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }}}

  Cursor  (.cursor/mcp.json):          same shape as Claude Code
  Gemini CLI  (~/.gemini/settings.json):  same shape as Claude Code
  Windsurf  (~/.codeium/windsurf/mcp_config.json):  same shape as Claude Code

  VS Code Copilot  (.vscode/mcp.json):

    { "servers": { "phototology": {
        "type": "stdio", "command": "npx", "args": ["-y", "@phototology/mcp"],
        "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }}}

  Codex CLI  (~/.codex/config.toml):

    [mcp_servers.phototology]
    command = "npx"
    args = ["-y", "@phototology/mcp"]

    [mcp_servers.phototology.env]
    PHOTOTOLOGY_API_KEY = "pt_live_..."

  Docs: https://api.phototology.com/v1/docs
`;

if (process.argv.includes('--help')) {
  console.error(SETUP_GUIDE);
  process.exit(0);
}

const apiKey = process.env.PHOTOTOLOGY_API_KEY;
if (!apiKey) {
  if (process.stdin.isTTY) {
    // Running in a terminal — offer interactive setup
    setupInteractive().catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
  } else {
    // Spawned by an MCP client — can't prompt, just print help
    console.error('  Error: PHOTOTOLOGY_API_KEY is not set.\n');
    console.error(SETUP_GUIDE);
    process.exit(1);
  }
} else {
  (async () => {
  const mcpVersion = require('../package.json').version;
  const mcpUserAgent = `@phototology/mcp/${mcpVersion}`;

  const server = new McpServer(
    {
      name: 'phototology',
      version: mcpVersion,
    },
    {
      instructions: buildServerInstructions(),
    },
  );

  registerTools(server, apiKey, mcpUserAgent);

  // Verify the API key before connecting transport to avoid mid-handshake crashes
  const verifyClient = new PhototologyClient({
    apiKey,
    baseUrl: process.env.PHOTOTOLOGY_BASE_URL,
    userAgent: mcpUserAgent,
  });
  try {
    await verifyClient.modules();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      console.error('  Error: PHOTOTOLOGY_API_KEY is invalid. Check your key at https://api.phototology.com');
      process.exit(1);
    }
    console.error(`  Warning: could not verify API key (${(err as Error).message}). Continuing anyway.`);
  }

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error('Failed to connect MCP transport:', err);
    process.exit(1);
  });
  })();
}
