---
description: "MCP server for GMC — exposes Google Merchant Center tools to AI assistants like Claude, Cursor, and VS Code Copilot via the Model Context Protocol."
---

# MCP Server

`gmc mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io/) server over stdio, exposing GMC tools to AI assistants. Any MCP-compatible client (Claude Desktop, Cursor, VS Code Copilot, etc.) can call them.

## Quick start

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gmc": {
      "command": "gmc",
      "args": ["mcp"]
    }
  }
}
```

Or with an explicit account:

```json
{
  "mcpServers": {
    "gmc": {
      "command": "gmc",
      "args": ["--account", "123456789", "mcp"]
    }
  }
}
```

The server uses your existing `gmc` auth configuration — the same credentials you use with the CLI.

## Tools

The server exposes 12 tools:

### Diagnostics

| Tool | Description |
|------|-------------|
| `doctor` | Diagnose auth, GCP registration, and Merchant API access |
| `preflight` | Validate feed files offline — catches disapprovals before upload |

### Account & catalog

| Tool | Description |
|------|-------------|
| `accounts_list` | List accessible Merchant Center accounts |
| `accounts_get` | Get account details |
| `products_list` | List products with status and issues |
| `products_get` | Get a single product by key |
| `products_insert` | Insert or update a product |
| `products_delete` | Delete a product |

### Feeds & reporting

| Tool | Description |
|------|-------------|
| `datasources_list` | List data sources (feeds) |
| `issues_account` | Get account-level issues and disapprovals |
| `quota_list` | Check daily API quota and usage |
| `reports_query` | Run an MCQL query (clicks, impressions, etc.) |

## Authentication

The MCP server uses the same auth as the CLI. Set up credentials once:

```bash
gmc auth login                    # interactive OAuth
# or
export GMC_SERVICE_ACCOUNT=key.json  # service account for headless use
```

Then `gmc mcp` picks up the credential automatically. Global options (`--profile`, `--account`) work too:

```bash
gmc --profile production --account 123456789 mcp
```

## Example conversations

With the MCP server running, an AI assistant can:

- "Check if my Merchant Center setup is working" → calls `doctor`
- "List my products and show any with issues" → calls `products_list`
- "Validate the feeds directory for disapprovals" → calls `preflight`
- "How many clicks did my products get last week?" → calls `reports_query`
- "What account-level issues do I have?" → calls `issues_account`
