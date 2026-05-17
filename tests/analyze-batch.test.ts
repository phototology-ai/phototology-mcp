import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const mockAnalyze = jest.fn();
const mockLookup = jest.fn();

jest.mock('@phototology/sdk', () => {
  const actual = jest.requireActual('@phototology/sdk');
  return {
    ...actual,
    PhototologyClient: jest.fn().mockImplementation(() => ({
      analyze: mockAnalyze,
      modules: jest.fn(),
      lookup: mockLookup,
      usage: jest.fn(),
    })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerTools } = require('../src/tools');

type ToolCallback = (args: any) => Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

function captureToolCallback(server: McpServer, toolName: string): ToolCallback {
  const spy = jest.spyOn(server, 'registerTool');
  registerTools(server, 'pt_test_abc123');
  const call = spy.mock.calls.find((c) => c[0] === toolName);
  if (!call) throw new Error(`Tool ${toolName} was not registered`);
  return call[2] as unknown as ToolCallback;
}

function emptyLookupResp() {
  return {
    object: 'lookup' as const,
    results: {},
    meta: { imagesSubmitted: 0, imagesMatched: 0, processingTimeMs: 1, requestId: 'req_l' },
  };
}

function freshAnalyzeResp(creditsCharged: number) {
  return {
    id: 'ana_batch_test',
    object: 'analysis',
    outputSchema: 'photo',
    output: { estimatedDate: { year: 1990 } },
    usage: { totalTokens: 100, estimatedCostUsd: 0.001, modulesUsed: ['dating'], creditsCharged },
    meta: {
      requestId: 'req_test',
      processingTimeMs: 500,
      provider: 'test',
      promptHash: 'abc',
      ai_generated: true,
      model: 'gemini-2.0-flash',
      vendor: 'google',
    },
    warnings: [],
  };
}

beforeEach(() => {
  mockAnalyze.mockReset();
  mockLookup.mockReset();
});

describe('analyze_batch tool', () => {
  it('registers with the expected annotations', () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const spy = jest.spyOn(server, 'registerTool');
    registerTools(server, 'pt_test_abc123');

    const call = spy.mock.calls.find((c) => c[0] === 'analyze_batch');
    expect(call).toBeDefined();
    const config = call![1] as { annotations: Record<string, unknown> };
    expect(config.annotations.readOnlyHint).toBe(true);
    expect(config.annotations.destructiveHint).toBe(false);
    expect(config.annotations.idempotentHint).toBe(true);
  });

  it('returns isError when neither lenses nor stack is provided', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const cb = captureToolCallback(server, 'analyze_batch');

    const result = await cb({
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/lenses.*stack/i);
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('with refresh=true, skips lookup and calls analyze once per photo', async () => {
    mockAnalyze.mockResolvedValue(freshAnalyzeResp(1));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const cb = captureToolCallback(server, 'analyze_batch');

    const urls = Array.from({ length: 3 }, (_, i) => `https://example.com/${i}.jpg`);
    const result = await cb({
      imageUrls: urls,
      lenses: ['dating'],
      refresh: true,
    });

    expect(result.isError).toBeFalsy();
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockAnalyze).toHaveBeenCalledTimes(3); // one per photo

    // Each call uses imageUrl (singular), not the multi-image `images` array.
    for (const call of mockAnalyze.mock.calls) {
      const args = call[0];
      expect(typeof args.imageUrl).toBe('string');
      expect(args.images).toBeUndefined();
      expect(args.modules).toEqual(['dating']);
      expect(args.refresh).toBe(true);
    }
    const calledUrls = mockAnalyze.mock.calls.map((c) => c[0].imageUrl).sort();
    expect(calledUrls).toEqual(urls.slice().sort());

    const payload = JSON.parse(result.content[0].text);
    expect(payload.totalSubmitted).toBe(3);
    expect(payload.totalAnalyzed).toBe(3);
    expect(payload.totalCacheHits).toBe(0);
    expect(payload.results).toHaveLength(3);
    expect(payload.results.every((r: any) => r.source === 'fresh')).toBe(true);
  });

  it('with refresh=false, runs bulk lookup before analyze', async () => {
    mockLookup.mockResolvedValue(emptyLookupResp());
    mockAnalyze.mockResolvedValue(freshAnalyzeResp(1));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const cb = captureToolCallback(server, 'analyze_batch');

    const result = await cb({
      imageUrls: ['https://example.com/x.jpg', 'https://example.com/y.jpg'],
      lenses: ['dating'],
    });

    expect(result.isError).toBeFalsy();
    expect(mockLookup).toHaveBeenCalled();
    expect(mockAnalyze).toHaveBeenCalled();
  });

  it('chunks lookup into batches of 50 and calls analyze per-photo for large jobs', async () => {
    mockLookup.mockResolvedValue(emptyLookupResp());
    mockAnalyze.mockResolvedValue(freshAnalyzeResp(1));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const cb = captureToolCallback(server, 'analyze_batch');

    const urls = Array.from({ length: 120 }, (_, i) => `https://example.com/${i}.jpg`);
    const result = await cb({
      imageUrls: urls,
      lenses: ['dating'],
    });

    expect(result.isError).toBeFalsy();

    // Lookup is chunked at 50: 50 + 50 + 20 = 3 calls.
    expect(mockLookup).toHaveBeenCalledTimes(3);
    const lookupChunkSizes = mockLookup.mock.calls.map((c) => c[0].images.length).sort();
    expect(lookupChunkSizes).toEqual([20, 50, 50]);

    // Analyze runs once per photo (empty lookup => all 120 are misses).
    expect(mockAnalyze).toHaveBeenCalledTimes(120);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.totalSubmitted).toBe(120);
    expect(payload.totalAnalyzed).toBe(120);
  });

  it('marks the failing photo as source:error and continues with the rest', async () => {
    // First call rejects, second resolves — verifies per-photo isolation.
    mockAnalyze
      .mockRejectedValueOnce(new Error('one boom'))
      .mockResolvedValueOnce(freshAnalyzeResp(1));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const cb = captureToolCallback(server, 'analyze_batch');

    const result = await cb({
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      lenses: ['dating'],
      refresh: true,
    });

    expect(result.isError).toBeFalsy(); // partial failures don't fail the whole batch
    const payload = JSON.parse(result.content[0].text);
    expect(payload.totalSubmitted).toBe(2);
    expect(payload.totalErrors).toBe(1);
    expect(payload.totalAnalyzed).toBe(1);
    const errored = payload.results.find((r: any) => r.source === 'error');
    expect(errored).toBeDefined();
    expect(errored.error).toMatch(/boom/);
    const succeeded = payload.results.find((r: any) => r.source === 'fresh');
    expect(succeeded).toBeDefined();
  });

  it('emits structuredContent mirroring the text payload', async () => {
    mockAnalyze.mockResolvedValue(freshAnalyzeResp(1));

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const cb = captureToolCallback(server, 'analyze_batch');

    const result = await cb({
      imageUrls: ['https://example.com/a.jpg'],
      lenses: ['dating'],
      refresh: true,
    });

    expect(result.structuredContent).toBeDefined();
    const text = JSON.parse(result.content[0].text);
    expect(result.structuredContent).toEqual(text);
  });
});
