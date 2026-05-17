import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PhototologyClient } from '@phototology/sdk';
import { renderToolError } from './errors';

export function registerListLenses(server: McpServer, client: PhototologyClient): void {
  const s = server as any;

  s.registerTool(
    'list_lenses',
    {
      description: [
        'List every available lens and preset on this server, with descriptions and the output fields each lens owns.',
        '',
        'Free. Does not bill credits. Call this for runtime discovery before deciding which lenses to pass to `analyze_photo`.',
        '',
        'Returns `{ modules: [{ name, description, category, outputFields }], presets: [{ name, description, modules }] }`. The legacy key name "modules" inside the response payload still refers to lenses (renaming is in progress at the API layer). Use the `outputFields` map to translate a field-name question (e.g. "what year was this taken?") into the right `lenses` argument on `analyze_photo` (e.g. `["dating"]`).',
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
        const result = await client.modules();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        return renderToolError(err);
      }
    },
  );
}
