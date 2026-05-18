# @phototology/mcp Development Protocol
> **Version:** 1.1.0 | **Architecture:** MCP stdio server wrapping @phototology/sdk | **Updated:** 2026-05-17

## What This Is

Stdio MCP server that exposes `@phototology/sdk` as six Model Context Protocol tools. Published to npm; referenced in Claude Code, Claude Desktop, Cursor, VS Code Copilot, Gemini CLI, Windsurf, Codex CLI. Binary: `phototology-mcp`.

**1.1.0 changes (2026-05-17):**
- Three new tools: `get_credits` (free balance read), `purchase_credits` (wallet deep-link), `analyze_batch` (1-200 photos per call).
- `list_modules` renamed to `list_lenses`; response reshaped from `{ modules, presets }` to `{ lenses, stacks }`.
- `analyze_photo` accepts `lenses: [...]` (preferred) and `stack: '...'` (preferred). The old names `modules` and `preset` work as deprecated aliases.
- `CreditExhaustedError` now returns `structuredContent.actions` with a typed `open_url` action so rich-rendering clients can show a button.
- Five companion skills ship in the npm package: `phototology:lookup-first`, `phototology:check-credits`, `phototology:smart-stack`, `phototology:photo-shared`, `phototology:batch-analyze`.
- Every tool declares full annotations (`readOnlyHint`, `destructiveHint: false`, `idempotentHint`, `openWorldHint`).

**1.0.0 breaking change (2026-04-17):** `lookup_photo` returns the Registry v2 shape — `photo.lenses` keyed map, not `analyses[]`. `analyze_photo` accepts `refresh?: boolean` to bypass the per-user-per-photo projection cache.

## Quick Start

| Command | Action |
|---------|--------|
| `pnpm build` | Compile to `dist/` |
| `pnpm typecheck` | Type-check without emit |
| `pnpm test` | Run Jest suite |
| `PHOTOTOLOGY_API_KEY=pt_test_... node dist/index.js` | Run server locally |

## Architecture

`src/index.ts` — reads `PHOTOTOLOGY_API_KEY`, builds the server-instructions handshake payload, creates `McpServer` with stdio transport, calls `registerTools()`.

`src/tools.ts` — re-export shim. Real code lives under `src/tools/`:

| File | Purpose |
|------|---------|
| `src/tools/index.ts` | Barrel. Instantiates the `PhototologyClient` once and calls each per-tool register function. |
| `src/tools/errors.ts` | `renderToolError()` + `ToolAction` type. Maps SDK errors to MCP tool-result shape, with `structuredContent.actions` on `CreditExhaustedError`. |
| `src/tools/analyze-photo.ts` | `analyze_photo` tool. Accepts `lenses`/`stack` (preferred) or legacy `modules`/`preset`. Translates to SDK args. |
| `src/tools/analyze-batch.ts` | `analyze_batch` tool. 1-200 photos per call. Lookup-first internally, chunks analyzes into 50s, surfaces `totalCacheHits`/`estimatedCreditsSaved`. |
| `src/tools/list-lenses.ts` | `list_lenses` tool. Reshapes the SDK's `{ modules, presets }` into MCP-facing `{ lenses, stacks }`. |
| `src/tools/lookup-photo.ts` | `lookup_photo` tool. Free. |
| `src/tools/get-credits.ts` | `get_credits` tool. Free. Wraps `client.usage()` for dual-pool balance reads. |
| `src/tools/purchase-credits.ts` | `purchase_credits` tool. Free. Returns the wallet deep-link with `utm_source=mcp` and a structured `open_url` action. |

Tools are `readOnlyHint: true`, `destructiveHint: false`. Successful results return `{ content: [{ type: 'text', text: JSON }] }` plus optional `structuredContent` for rich clients.

## Companion Skills

`skills/` ships in the npm package. Each `SKILL.md` is a self-contained markdown skill the user can copy into `~/.claude/skills/<name>/`:

| Skill | When to use |
|-------|------------|
| `phototology:lookup-first` | Before any analyze. Always. |
| `phototology:check-credits` | Before big batches or bespoke calls. |
| `phototology:smart-stack` | When the user has a narrow question; picks the cheapest lens subset. |
| `phototology:photo-shared` | Whenever the user shares, attaches, drops, or references an image. Routes through the registry-first analysis path. |
| `phototology:batch-analyze` | Any job with 2+ photos. Uses `analyze_batch` (not a loop). Bulks lookups, chunks analyzes, surfaces credit savings. |

## Key Conventions

**Env var required at startup:** `PHOTOTOLOGY_API_KEY` is checked in `index.ts` before server init. Missing key writes to stderr and exits with code 1 (stdout is reserved for JSON-RPC).

**Cast workaround:** `server as any` is used in each `registerXxx()` function to avoid TS2589 from complex Zod generics in the MCP SDK. Intentional. Do not remove.

**Optional base URL:** `PHOTOTOLOGY_BASE_URL` env var overrides the default API base (useful for local dev against `phototology-api`).

**No direct dependency on `@phototology/core`:** This package imports only `@phototology/sdk`. Never bypass the SDK to call the HTTP API directly.

**MCP-layer rename pattern:** `lenses`/`stack` are the preferred argument names on `analyze_photo` and the preferred response keys on `list_lenses`. The SDK still uses `modules` and `preset` internally; the MCP translates. New code should use the new names; old code keeps working during the 90-day deprecation window.

**Pricing model surfaced everywhere** (server instructions, tool descriptions, skills, README): 1 credit = $0.01 per lens per photo. Lookups free. Bespoke 5 credits per image plus 1 per stacked lens. Moderation free + always-on. Cache hits free. New users start with 5,000 free credits via the signup ladder (1,000 for verifying an email, 4,000 for adding a card-on-file; the card is never charged automatically). Packs at 1k/$10, 10k/$100, 100k/$1,000. First-purchase 2x bonus. No subscriptions. (Pricing v1 cutover 2026-05-17; see `docs/superpowers/specs/2026-05-17-phototology-pricing-v1-design.md`.)

## Phantom Patterns

| Pattern | Reality |
|---------|---------|
| 3 or 5 tools | Six: `analyze_photo`, `analyze_batch`, `list_lenses`, `lookup_photo`, `get_credits`, `purchase_credits` |
| `list_modules` is a tool | Renamed to `list_lenses` in 1.1.0. No back-compat alias for the tool name. |
| `modules` / `preset` are removed | Still accepted as deprecated aliases on `analyze_photo`. Prefer `lenses` / `stack`. |
| `McpServer` constructed with auth config | Auth is handled by the SDK (`apiKey` in client config) |
| SSE or HTTP transport | Stdio only. Remote MCP is a follow-up, not in 1.1.0. |
| Stripe checkout completes inside MCP | Cannot. `purchase_credits` returns a wallet URL the user must open. |
| PostHog instrumentation inside the MCP server | Reverted in `bc021f96`. API-side captures `client_type=mcp` from the `User-Agent` header. |
