import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools';

const apiKey = process.env.PHOTOTOLOGY_API_KEY;
if (!apiKey) {
  // stderr only — stdout is reserved for JSON-RPC
  console.error('Error: PHOTOTOLOGY_API_KEY environment variable is required.');
  console.error('Get your key at https://api.phototology.com');
  process.exit(1);
}

const server = new McpServer({
  name: 'phototology',
  version: '0.1.0',
});

registerTools(server, apiKey);

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to connect MCP transport:', err);
  process.exit(1);
});
