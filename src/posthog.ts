/**
 * Optional PostHog telemetry for tool-level analytics.
 *
 * Phototology-api already tracks every MCP call via `api_request` with
 * `client_type='mcp'` — that's the load-bearing signal for "is MCP being
 * used and by whom." This module adds a small per-tool layer so we can see
 * which tools dominate (analyze_photo vs lookup_photo vs list_modules) and
 * which fail, without having to JOIN api routes back to tool names.
 *
 * Disabled by default. Opt in by setting `PHOTOTOLOGY_MCP_POSTHOG_KEY`
 * (intentionally distinct from `POSTHOG_PROJECT_KEY` because this code runs
 * on the user's own machine — telemetry should be opt-in).
 *
 * @module posthog
 */

import { PostHog } from 'posthog-node';
import { createHash } from 'node:crypto';

const POSTHOG_KEY = process.env.PHOTOTOLOGY_MCP_POSTHOG_KEY;
const POSTHOG_HOST = process.env.PHOTOTOLOGY_MCP_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;
let distinctId: string | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  if (!POSTHOG_KEY) return null;
  client = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 5_000,
  });
  return client;
}

/**
 * Derive a stable per-key distinct_id without ever sending the raw key.
 * Same key → same hash → same person in PostHog, so we can answer
 * "how many MCP tool calls does this user make?" while keeping the key
 * itself out of analytics.
 */
function getDistinctId(apiKey: string): string {
  if (distinctId) return distinctId;
  distinctId = _deriveDistinctId(apiKey);
  return distinctId;
}

/**
 * Pure, exported for tests. Same key → same hash → same distinct_id forever.
 * 16-char hex prefix is enough namespace headroom for billions of MCP keys
 * (2^64 distinct values) while keeping the property compact.
 */
export function _deriveDistinctId(apiKey: string): string {
  const hash = createHash('sha256').update(apiKey).digest('hex');
  return `mcp_${hash.slice(0, 16)}`;
}

/** Test helper — reset the cached distinct_id between cases. */
export function _resetDistinctIdForTesting(): void {
  distinctId = null;
}

export type McpToolName = 'analyze_photo' | 'list_modules' | 'lookup_photo';

/**
 * Emit one `mcp_tool_called` event per tool invocation.
 *
 * Never throws — telemetry must never break the tool path. Stdout is
 * reserved for JSON-RPC, so failures go to stderr only.
 */
export function trackMcpTool(opts: {
  apiKey: string;
  tool: McpToolName;
  durationMs: number;
  success: boolean;
  errorCode?: string;
}): void {
  const ph = getClient();
  if (!ph) return;

  try {
    ph.capture({
      distinctId: getDistinctId(opts.apiKey),
      event: 'mcp_tool_called',
      properties: {
        tool: opts.tool,
        duration_ms: opts.durationMs,
        success: opts.success,
        error_code: opts.errorCode,
        mcp_version: process.env.npm_package_version,
      },
    });
  } catch (err) {
    process.stderr.write(`[PHOTOTOLOGY-MCP] PostHog capture failed: ${err instanceof Error ? err.message : err}\n`);
  }
}

/**
 * Flush pending events. Called on stdin close so the buffered batch lands
 * before the process exits.
 */
export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    process.stderr.write(`[PHOTOTOLOGY-MCP] PostHog shutdown failed: ${err instanceof Error ? err.message : err}\n`);
  }
}
