import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PhototologyClient } from '@phototology/sdk';
import { registerAnalyzePhoto } from './analyze-photo';
import { registerListLenses } from './list-lenses';
import { registerLookupPhoto } from './lookup-photo';
import { registerGetCredits } from './get-credits';
import { registerPurchaseCredits } from './purchase-credits';

/**
 * Register all MCP tools on the server.
 *
 * Creates a singleton PhototologyClient for connection reuse across tool calls.
 */
export function registerTools(server: McpServer, apiKey: string, userAgent?: string): void {
  const client = new PhototologyClient({
    apiKey,
    baseUrl: process.env.PHOTOTOLOGY_BASE_URL,
    userAgent,
  });

  registerAnalyzePhoto(server, client);
  registerListLenses(server, client);
  registerLookupPhoto(server, client);
  registerGetCredits(server, client);
  registerPurchaseCredits(server);
}
