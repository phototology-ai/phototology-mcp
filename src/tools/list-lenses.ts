import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PhototologyClient } from '@phototology/sdk';
import { renderToolError } from './errors';

/**
 * Reshape the SDK's `{ modules, presets }` response into the MCP's
 * brand-aligned `{ lenses, stacks }`. The inner `modules: string[]` field on
 * each preset (its constituent lens names) is also renamed to `lenses` so the
 * MCP output is consistent end-to-end.
 */
function reshapeForMcp(
  sdkResult: { modules: Array<{ name: string; description: string; category: string; outputFields: string[] }>; presets: Array<{ name: string; description: string; modules: string[] }> },
) {
  return {
    lenses: sdkResult.modules.map((m) => ({
      name: m.name,
      description: m.description,
      category: m.category,
      outputFields: m.outputFields,
    })),
    stacks: sdkResult.presets.map((p) => ({
      name: p.name,
      description: p.description,
      lenses: p.modules,
    })),
  };
}

export function registerListLenses(server: McpServer, client: PhototologyClient): void {
  const s = server as any;

  s.registerTool(
    'list_lenses',
    {
      description: [
        'List every available lens and stack on this server, with descriptions and the output fields each lens owns.',
        '',
        'Free. Does not bill credits. Call this for runtime discovery before deciding which lenses or stack to pass to `analyze_photo`.',
        '',
        'Returns `{ lenses: [{ name, description, category, outputFields }], stacks: [{ name, description, lenses }] }`. A lens is a single analysis capability; a stack is a named bundle of lenses that runs together (e.g. `automobile` runs `automobile` + `vehicle-condition` + supporting lenses). Use the lens `outputFields` map to translate a field-name question (e.g. "what year was this taken?") into the right `lenses` argument on `analyze_photo` (e.g. `["dating"]`).',
      ].join('\n'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const sdkResult = await client.modules();
        const reshaped = reshapeForMcp(sdkResult);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(reshaped, null, 2) }],
          structuredContent: reshaped,
        };
      } catch (err: unknown) {
        return renderToolError(err);
      }
    },
  );
}
