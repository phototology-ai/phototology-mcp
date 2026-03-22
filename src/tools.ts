import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PhototologyClient } from '@phototology/sdk';

const AnalyzeInputSchema = {
  imageUrl: z.string().url().describe('URL of the image to analyze'),
  preset: z.enum(['photo-analysis', 'memorial', 'vehicle-condition', 'quick-scan'])
    .default('photo-analysis')
    .describe('Analysis preset. photo-analysis includes all modules.'),
  modules: z.array(z.string()).optional()
    .describe('Specific modules to include (alternative to preset). Use list_modules to see options.'),
  includeEmbedding: z.boolean().default(false)
    .describe('Include 1408-dim embedding vector for similarity search'),
};

interface AnalyzeArgs {
  imageUrl: string;
  preset: string;
  modules?: string[];
  includeEmbedding: boolean;
}

/**
 * Register MCP tools on the server.
 *
 * Creates a singleton PhototologyClient for connection reuse across tool calls.
 */
export function registerTools(server: McpServer, apiKey: string): void {
  const client = new PhototologyClient({
    apiKey,
    baseUrl: process.env.PHOTOTOLOGY_BASE_URL,
  });

  // Cast needed: MCP SDK's registerTool generics hit TS2589 with complex Zod schemas
  const s = server as any;

  s.registerTool(
    'analyze_photo',
    {
      description: 'Analyze a photo using AI vision. Returns structured data: dating, people, location, atmosphere, entities, and more. 15 composable modules, 4 presets (photo-analysis, memorial, vehicle-condition, quick-scan). Use list_modules first to discover available modules.',
      inputSchema: AnalyzeInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ imageUrl, preset, modules, includeEmbedding }: AnalyzeArgs) => {
      const result = await client.analyze({
        imageUrl,
        ...(modules ? { modules } : { preset }),
        options: { includeEmbedding },
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  s.registerTool(
    'list_modules',
    {
      description: 'List available AI vision analysis modules and presets. Use this to discover what capabilities are available before calling analyze_photo.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await client.modules();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
