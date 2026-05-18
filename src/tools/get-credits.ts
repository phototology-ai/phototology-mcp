import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PhototologyClient } from '@phototology/sdk';
import { renderToolError } from './errors';

export function registerGetCredits(server: McpServer, client: PhototologyClient): void {
  const s = server as any;

  s.registerTool(
    'get_credits',
    {
      description: [
        'Read the current credit balance for the authenticated account. Free. Does not bill credits.',
        '',
        'When to use: before any `analyze_photo` loop, before a bespoke (5-credit) call, before a `full-analysis` preset (~16 credits per photo), or any time the user asks "how many credits do I have left?".',
        '',
        'Returns: `{ tier, community: { balance, monthlyAllowance, resetsInDays, referralBonus? }, purchased: { balance }, reserved }`. Phototology uses a dual-pool model: signup-grant credits (1,000 for verifying an email, 4,000 more for adding a card-on-file, one-time at signup) land in the community pool; purchased pack credits land in the purchased pool. Effective spendable credits = `community.balance + purchased.balance - reserved`. Community credits are spent FIRST, paid credits SECOND. `monthlyAllowance` and `resetsInDays` are legacy fields kept for backward compatibility; the monthly reset was retired in pricing v1 (cutover 2026-05-17) and `resetsInDays` reports 0 once the cutoff has bound for the account.',
        '',
        'If the user is low or out, call `purchase_credits` to get the wallet deep-link. First-time buyers get 2x credits on their first pack.',
      ].join('\n'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const result = await client.usage();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err: unknown) {
        return renderToolError(err);
      }
    },
  );
}
