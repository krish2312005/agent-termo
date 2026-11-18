# MCP Servers

Agent-Termo connects to Model Context Protocol servers over **stdio** and **Streamable HTTP**. Discovered MCP tools are exposed to the model alongside built-in tools and run through Agent-Termo's existing tool approval flow. MCP tools require approval unless the session is explicitly started in auto-approve mode.

## Configuration

Project configuration lives in `.agent-termo/mcp.json`. User configuration lives in `~/.agent-termo/mcp.json`. The project file overrides a user-level entry with the same server name.

### stdio server

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {},
      "cwd": "."
    }
  }
}
```

### Streamable HTTP server

```json
{
  "mcpServers": {
    "remote-tools": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer \${MCP_ACCESS_TOKEN}"
      }
    }
  }
}
```

Values written as `\${VARIABLE_NAME}` are read from the current process environment. Missing variables prevent that server from connecting. Keep credentials in environment variables or user-level configuration; do not commit secrets in project configuration.

## CLI

```bash
# Add a local stdio server
agent-termo mcp add filesystem --command npx --args '["-y","@modelcontextprotocol/server-filesystem","."]'

# Add a remote HTTP server
agent-termo mcp add remote-tools --url https://example.com/mcp --headers '{"Authorization":"Bearer ${MCP_ACCESS_TOKEN}"}'

# Save server settings for the current user instead of the project
agent-termo mcp add github --command npx --args '["-y","@modelcontextprotocol/server-github"]' --global

# List, test, enable, disable, or remove servers
agent-termo mcp list
agent-termo mcp test filesystem
agent-termo mcp disable filesystem
agent-termo mcp enable filesystem
agent-termo mcp remove filesystem
agent-termo mcp remove github --global
```

Use `agent-termo mcp add --help` for all options. After changing configuration, restart Agent-Termo to reconnect and refresh the available tool list.

MCP server commands are executable programs and remote servers receive the configured headers. Only configure servers you trust. Tool calls go through Agent-Termo's normal approval system; an MCP server's own instructions never grant permission to execute a tool.
