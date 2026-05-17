import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type PhototologyClient, LENS_FIELDS, PRESET_IDS, type LensId } from '@phototology/sdk';
import { renderToolError } from './errors';

const LENS_IDS = Object.keys(LENS_FIELDS) as [LensId, ...LensId[]];

/** Hard cap per tool call. For larger jobs, the agent loops the tool. */
const MAX_BATCH = 200;
/** Per-API-call cap for lookup. Matches server-side limit. */
const LOOKUP_CHUNK = 50;
/** Concurrent analyze calls in flight. Conservative — respects per-key rate limits. */
const ANALYZE_CONCURRENCY = 5;

const BatchInputSchema = {
  imageUrls: z.array(z.string().url()).min(1).max(MAX_BATCH)
    .describe(`List of independent, publicly fetchable image URLs to analyze separately (each photo gets its own output). 1 to ${MAX_BATCH} per call. For thousands of photos, loop this tool in slices of ${MAX_BATCH}.`),
  lenses: z.array(z.enum(LENS_IDS)).optional()
    .describe('Explicit list of lenses to run on every photo. Prefer this for cheap, targeted batches. Call `list_lenses` for descriptions. Either `lenses` or `stack` must be provided.'),
  stack: z.enum([...PRESET_IDS] as [string, ...string[]]).optional()
    .describe('Named bundle of lenses to run on every photo. Ignored when `lenses` is provided.'),
  refresh: z.boolean().optional()
    .describe('Bypass the registry lookup and re-run every lens on every photo. Default false: lookup-first, only analyze cache misses. Pass true only when the user explicitly asks to re-analyze.'),
};

interface BatchArgs {
  imageUrls: string[];
  lenses?: LensId[];
  stack?: string;
  refresh?: boolean;
}

interface PhotoOutcome {
  imageUrl: string;
  sha256?: string;
  source: 'cache' | 'fresh' | 'error';
  output?: Record<string, unknown>;
  creditsCharged?: number;
  error?: string;
}

interface BatchPayload {
  totalSubmitted: number;
  totalCacheHits: number;
  totalAnalyzed: number;
  totalErrors: number;
  totalCreditsCharged: number;
  estimatedCreditsSaved: number;
  results: PhotoOutcome[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Run an async map with bounded concurrency, preserving input order. */
async function mapBounded<T, U>(items: T[], limit: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push((async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return out;
}

/** Does the cached lens output already cover every requested lens? */
function cacheCovers(cached: Record<string, unknown> | undefined, requestedLenses: string[]): boolean {
  if (!cached) return false;
  for (const lens of requestedLenses) {
    if (!cached[lens]) return false;
  }
  return true;
}

export function registerAnalyzeBatch(server: McpServer, client: PhototologyClient): void {
  const s = server as any;

  s.registerTool(
    'analyze_batch',
    {
      description: [
        `Analyze 1 to ${MAX_BATCH} INDEPENDENT photos in a single tool call. Each photo is analyzed separately and gets its own output. Use this whenever the user has 2 or more photos to process.`,
        '',
        `Hard cap per call: ${MAX_BATCH} photos. For larger jobs, loop this tool in slices of ${MAX_BATCH}.`,
        '',
        'Internal flow (registry-aware, cost-optimized):',
        '  1. Bulk lookup all images at once (chunked into 50s server-side). Free.',
        '  2. For images whose cached lens output covers every requested lens, return from cache (0 credits charged for that photo).',
        '  3. For the rest, run per-photo analyze with bounded concurrency (5 in flight).',
        '  4. Aggregate per-photo results.',
        '',
        'Returns `{ totalSubmitted, totalCacheHits, totalAnalyzed, totalErrors, totalCreditsCharged, estimatedCreditsSaved, results: [...] }`. Each `results[i]` has the original imageUrl, `source: "cache" | "fresh" | "error"`, the per-photo output, and creditsCharged for that one photo.',
        '',
        'Cost: 1 credit per lens per non-cached photo. A 100-photo batch with `lenses: ["dating"]` and 80% cache hit rate costs 20 credits ($0.20). Surface `totalCreditsCharged` and `estimatedCreditsSaved` to the user so the value of the registry is visible.',
        '',
        'Provide either `lenses: [...]` (preferred for targeted batches) or `stack: "..."` (for bundled workflows). One is required.',
        '',
        'This tool is for INDEPENDENT photos (each its own subject). For multi-angle composite analysis of one subject (e.g., 8 angles of one vehicle), use `analyze_photo` with the existing multi-image API — the batch tool does not stitch.',
        '',
        'Errors on individual photos do NOT fail the whole batch — they appear as `source: "error"` entries in the results array. A global error (auth, rate limit, out-of-credits hitting on the first call) surfaces as a tool error.',
      ].join('\n'),
      inputSchema: BatchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ imageUrls, lenses, stack, refresh }: BatchArgs) => {
      if (!lenses && !stack) {
        return {
          content: [{ type: 'text' as const, text: 'Error: provide either `lenses: [...]` or `stack: "..."`. Call `list_lenses` to see available options.' }],
          isError: true as const,
        };
      }

      const outcomes: PhotoOutcome[] = imageUrls.map((url) => ({ imageUrl: url, source: 'fresh' }));

      try {
        // Step 1: bulk lookup, unless caller asked for a fresh re-run.
        // Lookup chunks are 50 images per server call; lookup is free.
        const urlToCache = new Map<string, { sha256: string; lensesOutput: Record<string, unknown> }>();
        const requestedLensList = lenses ?? null;

        if (!refresh) {
          for (const lookChunk of chunk(imageUrls, LOOKUP_CHUNK)) {
            const lookupResp = await client.lookup({ images: lookChunk });
            // Mapping URL -> cache entry: the API keys results by sha256
            // but does not echo the source URL inside each entry. We rely
            // on the documented invariant that the response preserves
            // input order. If that ever changes, this mapping needs the
            // API to attach the source URL to each result.
            const resultEntries = Object.entries(lookupResp.results ?? {});
            for (let i = 0; i < lookChunk.length; i++) {
              const url = lookChunk[i];
              const entry = resultEntries[i];
              if (!entry) continue;
              const [sha256, res] = entry;
              const lensesMap = res.photo?.lenses;
              if (!lensesMap) continue;
              const flat: Record<string, unknown> = {};
              for (const [lensName, lensEntry] of Object.entries(lensesMap)) {
                flat[lensName] = lensEntry.output;
              }
              urlToCache.set(url, { sha256, lensesOutput: flat });
            }
          }
        }

        // Step 2: identify cache hits, mark misses for analysis.
        const needsAnalysis: Array<{ url: string; idx: number }> = [];
        if (!refresh && requestedLensList) {
          imageUrls.forEach((url, idx) => {
            const cached = urlToCache.get(url);
            if (cached && cacheCovers(cached.lensesOutput, requestedLensList)) {
              outcomes[idx] = {
                imageUrl: url,
                sha256: cached.sha256,
                source: 'cache',
                output: Object.fromEntries(requestedLensList.map((l) => [l, cached.lensesOutput[l]])),
                creditsCharged: 0,
              };
            } else {
              needsAnalysis.push({ url, idx });
            }
          });
        } else {
          // refresh=true OR stack-mode (we cannot pre-validate stack coverage
          // without expanding the stack -> lenses map client-side).
          imageUrls.forEach((url, idx) => needsAnalysis.push({ url, idx }));
        }

        // Step 3: per-photo analyze with bounded concurrency.
        await mapBounded(needsAnalysis, ANALYZE_CONCURRENCY, async ({ url, idx }) => {
          try {
            const result = await client.analyze({
              imageUrl: url,
              ...(lenses ? { modules: lenses } : { preset: stack }),
              ...(refresh !== undefined ? { refresh } : {}),
            });
            outcomes[idx] = {
              imageUrl: url,
              source: 'fresh',
              output: result.output as Record<string, unknown>,
              creditsCharged: result.usage?.creditsCharged ?? 0,
            };
          } catch (err: unknown) {
            outcomes[idx] = {
              imageUrl: url,
              source: 'error',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        });

        const totalCacheHits = outcomes.filter((o) => o.source === 'cache').length;
        const totalAnalyzed = outcomes.filter((o) => o.source === 'fresh').length;
        const totalErrors = outcomes.filter((o) => o.source === 'error').length;
        const totalCreditsCharged = outcomes.reduce((sum, o) => sum + (o.creditsCharged ?? 0), 0);
        const lensCount = (lenses ?? []).length || 1;
        const estimatedCreditsSaved = totalCacheHits * lensCount;

        const payload: BatchPayload = {
          totalSubmitted: imageUrls.length,
          totalCacheHits,
          totalAnalyzed,
          totalErrors,
          totalCreditsCharged,
          estimatedCreditsSaved,
          results: outcomes,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (err: unknown) {
        return renderToolError(err);
      }
    },
  );
}
