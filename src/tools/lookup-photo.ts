import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PhototologyClient } from '@phototology/sdk';
import { renderToolError } from './errors';

const LookupInputSchema = {
  imageUrl: z.string().url().optional()
    .describe('Publicly fetchable image URL. Server downloads and hashes it; perceptual-hash matching catches re-encodes of the same image.'),
  sha256: z.string().length(64).optional()
    .describe('SHA-256 hex digest for direct lookup. Use when you already know the hash; skips the download.'),
};

interface LookupArgs {
  imageUrl?: string;
  sha256?: string;
}

export function registerLookupPhoto(server: McpServer, client: PhototologyClient): void {
  const s = server as any;

  s.registerTool(
    'lookup_photo',
    {
      description: [
        'Check if a photo has already been analyzed and return every cached lens result. Free. Does not bill credits.',
        '',
        'Use this before `analyze_photo` whenever possible. Phototology is a registry: any photo ever analyzed (by any user on the same account) is returned here without re-running the LLM.',
        '',
        'Input: either an `imageUrl` (server fetches and hashes) or a `sha256` (skip the download). When passing a URL, perceptual-hash matching also catches re-encodes and re-uploads of the same image.',
        '',
        'Returns `results[sha256].photo.lenses` — a map from lens name to its last-cached output. An empty `lenses` map means the photo has never been analyzed on this account.',
      ].join('\n'),
      inputSchema: LookupInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ imageUrl, sha256 }: LookupArgs) => {
      if (!imageUrl && !sha256) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Provide either `imageUrl` (server downloads + hashes) or `sha256` (direct lookup).' }],
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
        return renderToolError(err);
      }
    },
  );
}
