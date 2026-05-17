import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type PhototologyClient, LENS_FIELDS, PRESET_IDS, type LensId } from '@phototology/sdk';
import { renderToolError } from './errors';

const LENS_IDS = Object.keys(LENS_FIELDS) as [LensId, ...LensId[]];

/** Hard cap per tool call. For larger jobs, the agent loops the tool. */
const MAX_BATCH = 200;
/**
 * Concurrent analyze calls in flight.
 *
 * Generous by design: the API rate limiter is flat at 600 RPM per user
 * (2026-05-17), so 25-concurrent analyze calls is comfortably under the
 * cap and lets the agent burn through a batch fast. Tighten only if we
 * see real rate-limit pushback at this concurrency.
 */
const ANALYZE_CONCURRENCY = 25;
/** Concurrent lookup calls in flight (free, cheap, generous). */
const LOOKUP_CONCURRENCY = 20;

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
        // Step 1: per-URL lookup with bounded concurrency.
        //
        // Why per-URL instead of batched: the API's bulk-lookup response is
        // keyed by sha256 and does NOT echo the source URL. Mapping URL ->
        // cache entry from a batched response requires trusting the API to
        // preserve input order in its result object — an invariant the
        // OpenAPI spec doesn't formally promise. Per-URL lookups give a
        // deterministic mapping (one input URL -> one result entry) at the
        // cost of N HTTP roundtrips. Lookups are free + fast (~3ms each);
        // at LOOKUP_CONCURRENCY=20, a 200-image lookup pass completes in
        // ~30ms wall time.
        const urlToCache = new Map<string, { sha256: string; lensesOutput: Record<string, unknown> }>();
        const requestedLensList = lenses ?? null;

        if (!refresh) {
          await mapBounded(imageUrls, LOOKUP_CONCURRENCY, async (url) => {
            try {
              const r = await client.lookup({ images: [url] });
              const entries = Object.entries(r.results ?? {});
              if (entries.length === 0) return;
              const [sha256, res] = entries[0];
              const lensesMap = res.photo?.lenses;
              if (!lensesMap) return;
              const flat: Record<string, unknown> = {};
              for (const [lensName, lensEntry] of Object.entries(lensesMap)) {
                flat[lensName] = lensEntry.output;
              }
              urlToCache.set(url, { sha256, lensesOutput: flat });
            } catch {
              // Single-URL lookup failures are non-fatal: we'll fall
              // through to analyze for that one URL.
            }
          });
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
