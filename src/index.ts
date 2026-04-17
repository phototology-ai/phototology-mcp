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
    'Phototology is a photo-analysis API with a per-key photo registry. Treat it as a "visual intelligence" tool: given a photo, return structured facts about it.',
    '',
    '## Tools on this server',
    '- `analyze_photo` — run AI vision against an image. Bills credits.',
    '- `lookup_photo` — check the registry for prior analysis by sha256 or pHash. Free, no credits.',
    '- `list_modules` — enumerate lenses and presets at runtime, with descriptions.',
    '',
    '## Composable lenses',
    `Current lenses: ${lenses}. Each owns a specific set of top-level output fields. Pass a subset via \`modules: [...]\` to save credits when you only need some of them.`,
    '',
    '## Presets',
    `Bundled module sets: ${presets}. Use a preset when the workflow matches (e.g. \`memorial\` for tribute photos, \`automobile\` for vehicle analysis). Otherwise prefer explicit \`modules\` for precise billing.`,
    '',
    '## Delta billing (Registry v2)',
    'Every analyze call is deduplicated against a per-user-per-photo projection. Re-running the same lens on the same photo bills zero credits. Practical implication:',
    '- Before calling `analyze_photo`, if the user has already analyzed this image before, you can call `lookup_photo { sha256 }` (free) to see what\'s cached.',
    '- When the user asks to "re-analyze" or "redo" or "refresh" a photo, pass `refresh: true` on `analyze_photo`. This bypasses the cache and re-bills all requested lenses.',
    '- Surface `usage.creditsCharged` in the response back to the user when it is greater than zero so they see the cost.',
    '',
    '## Error handling',
    'If you receive an MCP tool error with text starting "Out of credits", stop and show the purchase link — the user is out of credits and needs to buy more before retrying. Do not retry the same call.',
    '',
    '## Response shape',
    'Analyze output is flat-keyed JSON — top-level keys are field names (e.g. `estimatedDate`, `peopleCount`, `atmosphere`), not lens names. Use `list_modules` to map fields back to their owning lens.',
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
