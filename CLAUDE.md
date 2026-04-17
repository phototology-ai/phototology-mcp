# @phototology/mcp Development Protocol
> **Version:** 0.1.1 | **Architecture:** MCP stdio server wrapping @phototology/sdk | **Updated:** 2026-04-10

## What This Is

Thin MCP server that exposes `@phototology/sdk` as two Model Context Protocol tools. Published to npm; referenced in Claude Desktop / mcp.so configs. Binary: `phototology-mcp`.

## Quick Start

| Command | Action |
|---------|--------|
| `pnpm build` | Compile to `dist/` |
| `pnpm typecheck` | Type-check without emit |
| `PHOTOTOLOGY_API_KEY=pt_test_... node dist/index.js` | Run server locally |

## Architecture

`src/index.ts` — reads `PHOTOTOLOGY_API_KEY`, creates `McpServer` with stdio transport, calls `registerTools()`.

`src/tools.ts` — creates one `PhototologyClient` singleton (shared across tool calls), registers three tools:

| Tool | Description |
|------|-------------|
| `analyze_photo` | Wraps `client.analyze()`. Args: `imageUrl`, `preset`, `modules?`, `includeEmbedding`. |
| `list_modules` | Wraps `client.modules()`. No args. |
| `lookup_photo` | Wraps `client.lookup()`. Args: `imageUrl?`, `sha256?`. Free, no credits. |

Tools are `readOnlyHint: true`. Results return as `{ content: [{ type: 'text', text: JSON }] }`.

## Key Conventions

**Env var required at startup:** `PHOTOTOLOGY_API_KEY` is checked in `index.ts` before server init. Missing key writes to stderr and exits with code 1 (stdout is reserved for JSON-RPC).

**Cast workaround:** `server as any` is used in `registerTools` to avoid TS2589 from complex Zod generics in the MCP SDK. This is intentional — do not remove it.

**Optional base URL:** `PHOTOTOLOGY_BASE_URL` env var overrides the default API base (useful for local dev against `phototology-api`).

**No direct dependency on `@phototology/core`:** This package imports only `@phototology/sdk`. Never bypass the SDK to call the HTTP API directly.

## Phantom Patterns

| Pattern | Reality |
|---------|---------|
| More than 3 tools | Only `analyze_photo`, `list_modules`, and `lookup_photo` |
| `McpServer` constructed with auth config | Auth is handled by the SDK (`apiKey` in client config) |
| SSE or HTTP transport | Stdio only |
