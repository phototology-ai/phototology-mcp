# @phototology/mcp

> Persistent memory for visual intelligence. Analyze once. Remember forever.

[![npm version](https://img.shields.io/npm/v/@phototology/mcp.svg)](https://www.npmjs.com/package/@phototology/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![MCP spec](https://img.shields.io/badge/MCP-2025--11--25-7e22ce.svg)](https://modelcontextprotocol.io/specification/2025-11-25)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org)

[![Install in VS Code](https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22phototology%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40phototology%2Fmcp%22%5D%2C%22env%22%3A%7B%22PHOTOTOLOGY_API_KEY%22%3A%22%22%7D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/Install%20in-VS%20Code%20Insiders-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](vscode-insiders:mcp/install?%7B%22name%22%3A%22phototology%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40phototology%2Fmcp%22%5D%2C%22env%22%3A%7B%22PHOTOTOLOGY_API_KEY%22%3A%22%22%7D%7D)
[![Install in Cursor](https://img.shields.io/badge/Install%20in-Cursor-000000?style=flat-square&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=phototology&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBwaG90b3RvbG9neS9tY3AiXSwiZW52Ijp7IlBIT1RPVE9MT0dZX0FQSV9LRVkiOiIifX0=)

> Click an install button to add the MCP server in one step. You'll be prompted to fill in `PHOTOTOLOGY_API_KEY` after install. For other editors, see the [Setup section](#setup-pick-your-editor) below.

MCP server for [Phototology](https://api.phototology.com/v1/docs), the visual-intelligence registry. Any MCP-speaking agent (Claude Code, Cursor, VS Code Copilot, Claude Desktop) calls Phototology as a tool. Photos are analyzed once, keyed by perceptual hash, then returned free forever to any future caller on the same account.

```bash
npx @phototology/mcp
```

The interactive wizard asks for your API key and writes the config for whichever editor you pick.

## Without Phototology vs With Phototology

**Without:** every agent that needs to understand a photo pays a vision model from scratch. Same image, same question, full price every time.

**With:** the first call bills 1 credit per lens. Every subsequent call on that photo returns the cached lens result for free. The registry compounds with use.

## 6 tools at a glance

| Tool | What it does | Cost |
|------|--------------|------|
| `analyze_photo` | Run AI vision against ONE image and return structured facts per lens. | 1 credit per lens. Re-running cached lenses on the same photo: 0. |
| `analyze_batch` | Analyze 1 to 200 photos in a single call. Internally lookup-first, then chunks analyzes into batches of 50. For thousands, loop in slices. | 1 credit per lens per non-cached photo. Cache hits free. |
| `lookup_photo` | Check if a single photo has already been analyzed; return all cached lens results. | Free. |
| `list_lenses` | Enumerate available lenses and stacks with descriptions and output fields. | Free. |
| `get_credits` | Read the account credit balance (community + purchased + reserved). | Free. |
| `purchase_credits` | Return a wallet deep-link the user can open to buy more credits. | Free. |

## Pricing

- **1 credit = $0.01 = one lens run on one photo.** Stack five lenses on a photo = 5 credits = $0.05.
- **Every account gets 1,000 community credits / month, free, no card required.** Spent first. Resets monthly. No rollover.
- **Lookups, lens discovery, balance reads, and purchase links are always free.**
- **Cache hits cost zero.** Re-running the same lens on the same photo returns the cached output for free.
- **Bespoke schema extraction = 5 credits per image** (plus 1 per additional stacked lens).
- **Moderation is free and always-on.** It's safety infrastructure, never billed.

### Credit packs (all at $0.01/credit, no volume discount)

| Pack | Credits | Price |
|------|---------|-------|
| Starter | 1,000 | $10 |
| Pro | 10,000 | $100 |
| Business | 100,000 | $1,000 |

**First purchase doubles.** Your first pack ever credits 2x. A Starter $10 buys 2,000 credits the first time. No subscriptions; pay-as-you-go via packs only.

## Setup: pick your editor

### Claude Code

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }
  }
}
```

### VS Code Copilot

`.vscode/mcp.json`:

```json
{
  "servers": {
    "phototology": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": { "PHOTOTOLOGY_API_KEY": "pt_live_..." }
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.phototology]
command = "npx"
args = ["-y", "@phototology/mcp"]

[mcp_servers.phototology.env]
PHOTOTOLOGY_API_KEY = "pt_live_..."
```

After editing the config, restart your editor. You should see 6 tools registered under `phototology`.

## First 5 minutes

Try these prompts in order:

1. **Discover.** *"Use the phototology MCP to show me what lenses are available."* The agent calls `list_lenses` and shows you the 16 lens catalog and 8 stacks.
2. **Check your balance.** *"How many phototology credits do I have?"* The agent calls `get_credits` and reports your dual-pool balance.
3. **Cheap analyze.** *"Analyze this photo with just the dating lens: `<url>`."* The agent picks `lenses: ["dating"]` and spends 1 credit instead of 16.
4. **Free re-lookup.** Repeat the same URL with a different question that the cached lens already answers. Zero credits.
5. **Out of credits.** Drain the pool, try another analyze. The agent receives a structured error with a wallet deep-link and surfaces it cleanly.

## Companion skills

Five optional skills ship inside the package under `node_modules/@phototology/mcp/skills/`. Copy any of them into your Claude skills directory (`~/.claude/skills/<skill-name>/`) to install:

- **`phototology:lookup-first`**: always check the registry before spending credits (single-photo).
- **`phototology:check-credits`**: pre-flight balance read before a big batch.
- **`phototology:smart-stack`**: smart-pick the cheapest lens subset for a specific question.
- **`phototology:photo-shared`**: activate whenever the user shares, attaches, drops, or references an image. Routes the photo through Phototology for the cheapest accurate answer.
- **`phototology:batch-analyze`**: any job with 2 or more photos. Calls `analyze_batch` instead of looping `analyze_photo`. Bulks lookups, chunks analyzes, surfaces credit savings.

When installed, the agent invokes them when context matches.

### Optional: auto-trigger on image attachment (Claude Code)

If you want Claude Code to automatically hint at Phototology the moment you attach an image (no model discretion required), add this hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "image",
        "command": "echo 'User shared an image. Consider phototology:photo-shared to route it through the registry-first analysis path.'"
      }
    ]
  }
}
```

The hook injects a system hint on every prompt containing an image, nudging the model toward the `phototology:photo-shared` skill before it picks anything else. Skip the hook if you prefer to let the model decide on its own.

## Lens reference

<!-- LENSES:START -->

| Lens | Owned output fields |
|------|---------------------|
| `dating` | `estimatedDate`, `techAnchors`, `temporalMarkers`, `title`, `genre`, `caption`, `dateAnchors`, `season`, `holiday`, `event`, `visibleDates`, `reproduction` |
| `people` | `physicalObservations`, `collectionDynamics`, `peopleCount` |
| `location` | `location` |
| `atmosphere` | `atmosphere`, `emotions`, `warmCaption`, `semanticDescription` |
| `entities` | `entities` |
| `accessibility` | `accessibility` |
| `photo-quality` | `quality`, `visualFaults`, `rotation`, `documentClassification`, `scan` |
| `text-content` | `textContent` |
| `composition` | `composition` |
| `moderation` | `moderation` |
| `describe` | `describe` |
| `condition` | `condition` |
| `authenticity` | `authenticity` |
| `color-palette` | `colorPalette` |
| `automobile` | `automobile` |
| `vehicle-condition` | `overallCondition`, `componentGrades`, `observations`, `accidentIndicators`, `photoQuality`, `missingViews`, `vehicleContext`, `photos`, `sellerSummary` |

<!-- LENSES:END -->

Pass any of these as `lenses: [...]` on `analyze_photo`, or use a stack (`full-analysis`, `quick-scan`, `automobile`, `claims`, `property`, `ecommerce`, `memorial`, `vehicle-condition`) to bundle several. The stack enum on the tool schema is the authoritative list; new lenses appear here automatically on publish.

> **Note on naming.** The previous tool name was `list_modules` and the previous arg names were `modules` / `preset`. The current names are `list_lenses` / `lenses` / `stack`. The old names still work as deprecated aliases on `analyze_photo` during the rename. Prefer the new names in new code.

## Delta billing

Phototology remembers every photo per account, keyed by perceptual hash. The second call on the same image bills zero credits for any lens that was already run. Only new lenses hit the LLM. Pass `refresh: true` to bypass the cache and re-run.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PHOTOTOLOGY_API_KEY` | Yes | Your API key (`pt_live_...` or `pt_test_...`). |
| `PHOTOTOLOGY_BASE_URL` | No | API base URL. Default: `https://api.phototology.com`. |

Keys starting with `pt_test_` use the test sandbox (instant responses, zero cost, golden fixtures).

## FAQ

**Why does `analyze_photo` accept both `lenses` and `modules`?**
The brand name was unified from "module" to "lens" in 2026-04. Both names are accepted on the MCP surface during the rename; the SDK still uses `modules`. Prefer `lenses` in new code.

**Why is moderation never billed?**
Moderation is safety infrastructure, not a feature you opt into. CSAM + illegal-content detection runs on every analyze. Treating it as a price line item would create perverse incentives.

**How is `get_credits` different from `lookup_photo`?**
`get_credits` reads your account balance. `lookup_photo` checks whether a specific image has been analyzed before. Both are free; they answer different questions.

**Why is `purchase_credits` a "deep-link" instead of completing checkout?**
Stripe checkout requires a browser. The MCP cannot complete payment; the user must open the URL the tool returns.

## Links

- [TypeScript SDK](https://www.npmjs.com/package/@phototology/sdk): `npm install @phototology/sdk`
- [API Documentation](https://api.phototology.com/v1/docs)
- [OpenAPI Spec](https://api.phototology.com/v1/openapi.json)
- [GitHub](https://github.com/phototology-ai/phototology-mcp)

## License

MIT
