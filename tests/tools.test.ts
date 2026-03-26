import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../src/tools';

jest.mock('@phototology/sdk', () => ({
  PhototologyClient: jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockResolvedValue({
      id: 'ana_test123',
      object: 'analysis',
      outputSchema: 'photo',
      output: { estimatedDate: { year: 1990 } },
      usage: { totalTokens: 100, estimatedCostUsd: 0.001, modulesUsed: ['dating'] },
      meta: { requestId: 'req_test', processingTimeMs: 500, provider: 'test', promptHash: 'abc' },
      warnings: [],
    }),
    modules: jest.fn().mockResolvedValue({
      modules: [{ name: 'dating', description: 'Date estimation', category: 'core', outputFields: ['estimatedDate'] }],
      presets: [{ name: 'full-analysis', description: 'Full analysis', modules: ['dating'] }],
    }),
  })),
}));

describe('registerTools', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
  });

  it('registers analyze_photo and list_modules tools', () => {
    const toolSpy = jest.spyOn(server, 'registerTool');
    registerTools(server, 'pt_test_abc123');

    expect(toolSpy).toHaveBeenCalledTimes(2);
    expect(toolSpy.mock.calls[0][0]).toBe('analyze_photo');
    expect(toolSpy.mock.calls[1][0]).toBe('list_modules');
  });

  it('creates a singleton PhototologyClient with the provided API key', () => {
    const { PhototologyClient } = require('@phototology/sdk');
    registerTools(server, 'pt_test_mykey');

    expect(PhototologyClient).toHaveBeenCalledTimes(1);
    expect(PhototologyClient).toHaveBeenCalledWith({ apiKey: 'pt_test_mykey' });
  });
});
