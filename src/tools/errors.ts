import { CreditExhaustedError } from '@phototology/sdk';

/**
 * Action object embedded in `structuredContent` so MCP clients that support
 * rich rendering (Claude Code, future Claude.ai, Cursor) can show a real
 * button. Clients that don't render `structuredContent` still see the URL
 * in the text fallback.
 */
export interface ToolAction {
  type: 'open_url';
  label: string;
  url: string;
}

interface RenderedError {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: { actions: ToolAction[] };
  isError: true;
}

/**
 * Render an SDK error as an MCP tool execution result.
 *
 * Credit exhaustion gets a human-readable message AND a structured `actions`
 * payload (MCP 2025-06-18 spec) so clients can render a button. Clients
 * without structured-content support still see the URL in the text fallback.
 *
 * All other errors fall through to the existing `Error: <message>` format.
 */
export function renderToolError(err: unknown): RenderedError {
  if (err instanceof CreditExhaustedError) {
    const lines = [`Out of credits. You need ${err.creditsRequired} credits.`];
    if (typeof err.resetsInDays === 'number') {
      lines.push(`Your community credits reset in ${err.resetsInDays} days.`);
    }
    lines.push(`Buy credits at ${err.purchaseUrl}`);
    return {
      content: [{ type: 'text' as const, text: lines.join(' ') }],
      structuredContent: {
        actions: [
          {
            type: 'open_url',
            label: 'Buy credits in your Phototology wallet',
            url: err.purchaseUrl,
          },
        ],
      },
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
