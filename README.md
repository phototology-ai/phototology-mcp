# @phototology/mcp

**The harness MCP server. Analyze once. Remember forever.**

MCP server for [Phototology](https://api.phototology.com/v1/docs), the harness for visual intelligence. Any MCP-speaking agent framework (Claude Code, Cursor, VS Code Copilot, custom) can call Phototology as a tool. Perceptual-hash registry means the second agent that asks about a photo gets the answer for free.

[![npm version](https://img.shields.io/npm/v/@phototology/mcp)](https://www.npmjs.com/package/@phototology/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Tools

| Tool | Description |
|------|-------------|
| `analyze_photo` | Analyze a photo with AI vision. Returns structured data: dating, people, location, atmosphere, entities, and more. 16 composable lenses, 8 presets. Supports `refresh: boolean` to bypass the projection cache and re-run the LLM. |
| `list_modules` | List available lenses and presets. Call this first to discover capabilities. |
| `lookup_photo` | Look up a photo's full analysis history by sha256 or perceptual hash. Free, no credits charged. Returns every lens ever run on the photo, keyed by lens name. |

## Setup

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": {
        "PHOTOTOLOGY_API_KEY": "pt_live_..."
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "phototology": {
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": {
        "PHOTOTOLOGY_API_KEY": "pt_live_..."
      }
    }
  }
}
```

### VS Code Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "phototology": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@phototology/mcp"],
      "env": {
        "PHOTOTOLOGY_API_KEY": "pt_live_..."
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PHOTOTOLOGY_API_KEY` | Yes | Your API key (`pt_live_...` or `pt_test_...`) |
| `PHOTOTOLOGY_BASE_URL` | No | API base URL (default: `https://api.phototology.com`) |

Keys starting with `pt_test_` use the test sandbox (instant responses, zero cost).

## Delta billing

Phototology remembers every photo per API key. The second call on the same image bills zero credits for any lens that was already run. Only new lenses hit the LLM. Pass `refresh: true` to bypass the cache and re-run.

## Example Output

Calling `analyze_photo` with a family photo:

```json
{
  "id": "ana_7f3a9c2e",
  "outputSchema": "photo",
  "output": {
    "estimatedDate": {
      "year": 1992,
      "decade": "1990s",
      "confidence": "high"
    },
    "warmCaption": "A family gathered around a birthday cake in a sunlit kitchen",
    "people": {
      "count": 4,
      "descriptions": ["..."]
    },
    "location": {
      "setting": "indoor",
      "type": "residential kitchen"
    }
  },
  "usage": {
    "totalTokens": 1500,
    "estimatedCostUsd": 0.0003,
    "creditsCharged": 4,
    "modulesUsed": ["dating", "people", "location", "atmosphere"]
  }
}
```

Calling `lookup_photo` for the same photo later:

```json
{
  "object": "lookup",
  "results": {
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855": {
      "matchType": "exact",
      "photo": {
        "sha256": "e3b0c442...",
        "pHash": "fc1c149afbf4c899",
        "dHash": "6fb92427ae41e464",
        "firstAnalyzedAt": "2026-04-10T12:34:56Z",
        "lastAnalyzedAt": "2026-04-17T09:00:00Z",
        "totalCreditsSpent": 4,
        "analyzeCallCount": 1,
        "lenses": {
          "dating": {
            "eventId": "evt_01h...",
            "output": { "estimatedDate": { "year": 1992, "confidence": "high" } },
            "version": "1.0",
            "producedAt": "2026-04-10T12:34:56Z",
            "coRunHash": "a1b2c3d4",
            "provider": "gemini"
          },
          "people": { "eventId": "evt_02h...", "output": { "count": 4 }, "version": "1.0", "producedAt": "2026-04-10T12:34:56Z", "coRunHash": "a1b2c3d4", "provider": "gemini" }
        }
      }
    }
  },
  "meta": { "imagesSubmitted": 1, "imagesMatched": 1, "processingTimeMs": 18, "requestId": "req_..." }
}
```

## Links

- [TypeScript SDK](https://www.npmjs.com/package/@phototology/sdk) — `npm install @phototology/sdk`
- [API Documentation](https://api.phototology.com/v1/docs)
- [OpenAPI Spec](https://api.phototology.com/v1/openapi.json)
- [GitHub](https://github.com/nlakios/family-photo-chronology/tree/main/packages/phototology-mcp)

## License

MIT
