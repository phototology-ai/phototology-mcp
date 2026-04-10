import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PhototologyClient, AuthenticationError } from '@phototology/sdk';
import { registerTools } from './tools';
import { setupInteractive } from './setup';

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
  const server = new McpServer({
    name: 'phototology',
    version: '0.1.4',
  });

  registerTools(server, apiKey);

  // Verify the API key before connecting transport to avoid mid-handshake crashes
  const verifyClient = new PhototologyClient({
    apiKey,
    baseUrl: process.env.PHOTOTOLOGY_BASE_URL,
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
