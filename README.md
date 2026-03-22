# @phototology/mcp

MCP server for the [Phototology](https://api.phototology.com/v1/docs) AI vision API. Gives AI coding assistants the ability to analyze photos.

[![npm version](https://img.shields.io/npm/v/@phototology/mcp)](https://www.npmjs.com/package/@phototology/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Tools

| Tool | Description |
|------|-------------|
| `analyze_photo` | Analyze a photo with AI vision. Returns structured data: dating, people, location, atmosphere, entities, and more. 15 composable modules, 4 presets. |
| `list_modules` | List available analysis modules and presets. Call this first to discover capabilities. |

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
    "modulesUsed": ["dating", "people", "location", "atmosphere"]
  }
}
```

## Links

- [TypeScript SDK](https://www.npmjs.com/package/@phototology/sdk) — `npm install @phototology/sdk`
- [API Documentation](https://api.phototology.com/v1/docs)
- [OpenAPI Spec](https://api.phototology.com/v1/openapi.json)
- [GitHub](https://github.com/nlakios/family-photo-chronology/tree/main/packages/phototology-mcp)

## License

MIT
