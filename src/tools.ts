import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PhototologyClient } from '@phototology/sdk';

const AnalyzeInputSchema = {
  imageUrl: z.string().url().describe('URL of the image to analyze'),
  preset: z.enum(['full-analysis', 'quick-scan', 'automobile', 'claims', 'property', 'ecommerce', 'memorial', 'vehicle-condition'])
    .default('full-analysis')
    .describe('Analysis preset. full-analysis includes all modules.'),
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
      description: 'Analyze a photo using AI vision. Returns structured data: dating, people, location, atmosphere, entities, and more. 15 composable lenses, 8 presets. Use list_modules first to discover available modules.',
      inputSchema: AnalyzeInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ imageUrl, preset, modules, includeEmbedding }: AnalyzeArgs) => {
      try {
        const result = await client.analyze({
          imageUrl,
          ...(modules ? { modules } : { preset }),
          options: { includeEmbedding },
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  s.registerTool(
    'list_modules',
    {
      description: 'List available AI vision analysis modules and presets. Use this to discover what capabilities are available before calling analyze_photo.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const result = await client.modules();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  const LookupInputSchema = {
    imageUrl: z.string().url().optional().describe('URL of the image to look up'),
    sha256: z.string().length(64).optional().describe('SHA-256 hash for direct lookup (skip image download)'),
  };

  interface LookupArgs {
    imageUrl?: string;
    sha256?: string;
  }

  s.registerTool(
    'lookup_photo',
    {
      description: 'Check if a photo has been previously analyzed and retrieve all known results. Provide either an image URL or a SHA-256 hash. Lookups are free and do not consume credits.',
      inputSchema: LookupInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ imageUrl, sha256 }: LookupArgs) => {
      if (!imageUrl && !sha256) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Provide either imageUrl or sha256.' }],
          isError: true,
        };
      }

      try {
        const result = await client.lookup({
          ...(imageUrl ? { images: [imageUrl] } : {}),
          ...(sha256 ? { sha256 } : {}),
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
