# shaqsiyad-mcp

MCP server for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Lets Claude and other agents pull fictional people with whole lives: "five nurses in Nairobi", "a Somali family", "a software team of six".

## Tools

| Tool | What it returns |
|---|---|
| `search_people` | Summaries matching text and filters |
| `random_people` | Complete random people (seedable) |
| `get_person` | One complete person |
| `get_fixtures` | users, customers, employees or patients records |
| `get_households` | People with partner and children |
| `get_team` | A manager and reports |
| `get_graph` | Connections around a person |

## Claude Code

```sh
claude mcp add shaqsiyad -- npx -y shaqsiyad-mcp
```

## Claude Desktop

```json
{
  "mcpServers": {
    "shaqsiyad": { "command": "npx", "args": ["-y", "shaqsiyad-mcp"] }
  }
}
```

Set `SHAQSIYAD_BASE_URL` in `env` to use another server.
