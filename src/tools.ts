import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  PhototologyClient,
  CreditExhaustedError,
  LENS_FIELDS,
  PRESET_IDS,
  type LensId,
} from '@phototology/sdk';
import { trackMcpTool } from './posthog';

// Derive the Zod enum from SDK's authoritative lens list so adding a lens
// there automatically updates MCP's validation without a second edit.
const LENS_IDS = Object.keys(LENS_FIELDS) as [LensId, ...LensId[]];

/**
 * Render an error thrown by the SDK as an MCP tool result.
 *
 * Credit exhaustion gets a human-readable message pointing to the purchase
 * URL (per MCP spec, this is a tool execution error — `isError: true` —
 * NOT a protocol-level error). All other errors fall through to the
 * existing `Error: <message>` format.
 */
function renderToolError(err: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  if (err instanceof CreditExhaustedError) {
    const parts = [`Out of credits. You need ${err.creditsRequired} credits.`];
    if (typeof err.resetsInDays === 'number') {
      parts.push(`Your community credits reset in ${err.resetsInDays} days.`);
    }
    parts.push(`Buy credits at ${err.purchaseUrl}`);
    return {
      content: [{ type: 'text' as const, text: parts.join(' ') }],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

const AnalyzeInputSchema = {
  imageUrl: z.string().url().describe('URL of the image to analyze'),
  preset: z.enum([...PRESET_IDS] as [string, ...string[]])
    .default('full-analysis')
    .describe('Analysis preset. full-analysis runs every lens.'),
  modules: z.array(z.enum(LENS_IDS)).optional()
    .describe('Specific lenses to run (alternative to preset). Cheaper than preset when you only need a few. Valid values come from the enum; call list_modules for descriptions.'),
  includeEmbedding: z.boolean().default(false)
    .describe('Include 1408-dim embedding vector for similarity search'),
  refresh: z.boolean().optional()
    .describe('Bypass the projection cache and re-run the LLM for all requested lenses. Cached lens outputs are reused by default.'),
};

interface AnalyzeArgs {
  imageUrl: string;
  preset: string;
  modules?: LensId[];
  includeEmbedding: boolean;
  refresh?: boolean;
}

/**
 * Register MCP tools on the server.
 *
 * Creates a singleton PhototologyClient for connection reuse across tool calls.
 */
export function registerTools(server: McpServer, apiKey: string, userAgent?: string): void {
  const client = new PhototologyClient({
    apiKey,
    baseUrl: process.env.PHOTOTOLOGY_BASE_URL,
    userAgent,
  });

  // Cast needed: MCP SDK's registerTool generics hit TS2589 with complex Zod schemas
  const s = server as any;

  s.registerTool(
    'analyze_photo',
    {
      description: 'Analyze a photo using AI vision. Returns structured data per requested lens (dating, people, location, atmosphere, entities, and more). Pass specific lenses via `modules` to minimize credit cost, or use a preset for bundled workflows. Call list_modules to discover every available lens + preset.',
      inputSchema: AnalyzeInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ imageUrl, preset, modules, includeEmbedding, refresh }: AnalyzeArgs) => {
      const start = Date.now();
      try {
        const result = await client.analyze({
          imageUrl,
          ...(modules ? { modules } : { preset }),
          options: { includeEmbedding },
          ...(refresh !== undefined ? { refresh } : {}),
        });
        trackMcpTool({ apiKey, tool: 'analyze_photo', durationMs: Date.now() - start, success: true });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const errorCode = err instanceof CreditExhaustedError ? 'credit_exhausted' : 'error';
        trackMcpTool({ apiKey, tool: 'analyze_photo', durationMs: Date.now() - start, success: false, errorCode });
        return renderToolError(err);
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
      const start = Date.now();
      try {
        const result = await client.modules();
        trackMcpTool({ apiKey, tool: 'list_modules', durationMs: Date.now() - start, success: true });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        trackMcpTool({ apiKey, tool: 'list_modules', durationMs: Date.now() - start, success: false, errorCode: 'error' });
        return renderToolError(err);
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
      const start = Date.now();
      if (!imageUrl && !sha256) {
        trackMcpTool({ apiKey, tool: 'lookup_photo', durationMs: 0, success: false, errorCode: 'missing_input' });
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
        trackMcpTool({ apiKey, tool: 'lookup_photo', durationMs: Date.now() - start, success: true });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        trackMcpTool({ apiKey, tool: 'lookup_photo', durationMs: Date.now() - start, success: false, errorCode: 'error' });
        return renderToolError(err);
      }
    },
  );
}
