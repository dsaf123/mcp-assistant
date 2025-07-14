# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a remote MCP (Model Context Protocol) server built for Cloudflare Workers that demonstrates OAuth authentication integration. The project implements a basic math tool (addition) accessible via MCP with OAuth protection.

## Key Development Commands

```bash
# Local development
npm run dev           # Start local development server on port 8787
wrangler dev         # Alternative development command

# Code quality
npm run format       # Format code with Biome
npm run lint:fix     # Fix linting issues with Biome
npm run type-check   # Run TypeScript type checking

# Deployment
npm run deploy       # Deploy to Cloudflare Workers
```

## Architecture Overview

### Core Components

- **MyMCP Class** (`src/index.ts`): Extends `McpAgent` and defines MCP tools. Currently implements an `add` tool that takes two numbers and returns their sum.

- **OAuth Provider** (`src/index.ts`): Uses `@cloudflare/workers-oauth-provider` to handle OAuth flow with endpoints:
  - `/sse` - MCP API endpoint (protected by OAuth)
  - `/authorize` - OAuth authorization page
  - `/token` - OAuth token endpoint
  - `/register` - Client registration endpoint

- **Web App** (`src/app.ts`): Hono-based web application providing:
  - Homepage (`/`) - Renders README content
  - Authorization flow (`/authorize`, `/approve`) - OAuth consent screens

### Infrastructure

- **Durable Objects**: Uses `MyMCP` class as a durable object for persistent MCP server state
- **KV Storage**: `OAUTH_KV` namespace for OAuth token/session storage
- **Static Assets**: Serves files from `static/` directory via Workers Assets

### Authentication Flow

The app supports both logged-in and logged-out authorization flows. Currently hardcoded to show logged-in state (`isLoggedIn = true` in `src/app.ts:34`). For demo purposes, any email/password combination is accepted.

## MCP Integration

### Local Testing
```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector
# Connect to: http://localhost:8787/sse

# Test with mcp-remote CLI
npx mcp-remote http://localhost:8787/sse
```

### Claude Desktop Configuration
```json
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8787/sse"]
    }
  }
}
```

## Configuration Files

- **wrangler.jsonc**: Cloudflare Workers configuration with durable objects, KV namespaces, and compatibility settings
- **biome.json**: Code formatting and linting rules (4-space indents, 100 char line width)
- **tsconfig.json**: TypeScript configuration targeting ES2021 with bundler resolution

## Development Notes

- Uses Hono framework for HTTP routing
- HTML templates use Tailwind CSS via CDN
- Markdown rendering with `marked` library for README display
- OAuth scopes: `read_profile`, `read_data`, `write_data`
- Static assets directory includes README symlink for homepage content