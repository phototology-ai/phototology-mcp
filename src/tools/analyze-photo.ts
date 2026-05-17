import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type PhototologyClient, LENS_FIELDS, PRESET_IDS, type LensId } from '@phototology/sdk';
import { renderToolError } from './errors';

const LENS_IDS = Object.keys(LENS_FIELDS) as [LensId, ...LensId[]];

const AnalyzeInputSchema = {
  imageUrl: z.string().url()
    .describe('Publicly fetchable image URL. JPEG, PNG, GIF, WebP, or HEIC. The server fetches it server-side, so local file paths and base64 are not accepted here.'),
  stack: z.enum([...PRESET_IDS] as [string, ...string[]])
    .default('full-analysis')
    .describe('Named bundle of lenses — a stack — to run together. Use when the workflow matches the stack name (e.g. `automobile` for vehicle photos, `memorial` for tribute photos). Ignored when `lenses` is provided. (Previously named `preset`; that name is still accepted as a deprecated alias.)'),
  preset: z.enum([...PRESET_IDS] as [string, ...string[]]).optional()
    .describe('Deprecated alias for `stack`. Prefer `stack` in new code.'),
  lenses: z.array(z.enum(LENS_IDS)).optional()
    .describe('Explicit list of lenses to run. Prefer this over `stack` when you only need a few; it bills only for the lenses you pick. Call `list_lenses` for descriptions of each lens. (The previous parameter name was `modules` — still accepted as an alias during the rename.)'),
  modules: z.array(z.enum(LENS_IDS)).optional()
    .describe('Deprecated alias for `lenses`. Prefer `lenses` in new code; this name still works for backward compatibility.'),
  includeEmbedding: z.boolean().default(false)
    .describe('Include the 1408-dim embedding vector for similarity search. Adds tokens to the response; leave false unless you need it.'),
  refresh: z.boolean().optional()
    .describe('Force the LLM to re-run every requested lens, bypassing the per-account projection cache. Only pass `true` when the user explicitly asks to "re-analyze" or "refresh" — default cache reuse saves credits.'),
};

interface AnalyzeArgs {
  imageUrl: string;
  stack: string;
  /** @deprecated Use `stack`. Accepted for backward compatibility. */
  preset?: string;
  lenses?: LensId[];
  /** @deprecated Use `lenses`. Accepted for backward compatibility. */
  modules?: LensId[];
  includeEmbedding: boolean;
  refresh?: boolean;
}

export function registerAnalyzePhoto(server: McpServer, client: PhototologyClient): void {
  // Cast: MCP SDK's registerTool generics hit TS2589 with complex Zod schemas.
  const s = server as any;

  s.registerTool(
    'analyze_photo',
    {
      description: [
        'Analyze a photo with AI vision and return structured facts. Use when the user has an image URL and needs information about it (dates, people, location, condition, entities, etc.).',
        '',
        'Before calling this, prefer `lookup_photo` first. If the photo has been analyzed before (any user on this account), the cached lens result is returned for free.',
        '',
        'Cost: 1 credit per lens ($0.01). The `full-analysis` stack runs every lens (~16 credits). To stay cheap, pass `lenses: ["dating", "people"]` with only the lenses you need. Re-running the same lens on the same photo costs zero (delta billing).',
        '',
        'Lens / stack selection: call `list_lenses` if you do not know which lens owns the field you need, or which stack matches the workflow. Each lens names its output fields explicitly; each stack names the lenses it contains.',
        '',
        'Output: flat JSON keyed by field name (e.g. `estimatedDate`, `peopleCount`, `warmCaption`). `usage.creditsCharged` tells you the actual cost. Surface it to the user when greater than zero.',
        '',
        'Out of credits: returns an error whose `structuredContent.actions[0].url` is a wallet deep-link. Show the URL to the user verbatim. Do not retry the call.',
      ].join('\n'),
      inputSchema: AnalyzeInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ imageUrl, stack, preset, lenses, modules, includeEmbedding, refresh }: AnalyzeArgs) => {
      // Agents may pass `lenses` (preferred) or `modules` (deprecated alias),
      // and `stack` (preferred) or `preset` (deprecated alias). The SDK + API
      // still expect `modules` and `preset`; we translate here so the rename
      // lives entirely at the MCP surface.
      const chosenLenses = lenses ?? modules;
      const chosenStack = preset ?? stack;
      try {
        const result = await client.analyze({
          imageUrl,
          ...(chosenLenses ? { modules: chosenLenses } : { preset: chosenStack }),
          options: { includeEmbedding },
          ...(refresh !== undefined ? { refresh } : {}),
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return renderToolError(err);
      }
    },
  );
}
