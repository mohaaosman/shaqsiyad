# Changelog

## 0.2.0 — 2026-11-24

### `shaqsiyad` (npm)
- **CLI**: `npx shaqsiyad random|search|person|graph|fixtures|households|team|stats|avatar|sheet`, with JSON, CSV and NDJSON output.
- `searchAll()` async iterator walks every page, with an optional `max`.
- `person(id, { fields })` trims a profile to the keys you need.
- `export('random', …)` for CSV/NDJSON random people.
- Client options: `timeout`, `retries` (now also on `5xx`), and a custom `fetch`.
- Network errors and timeouts throw `ShaqsiyadError` with `status: 0`.
- Empty and `null` query values are dropped from URLs.

### `shaqsiyad` (PyPI)
- **CLI**: `shaqsiyad …` / `python -m shaqsiyad …`, matching the npm CLI.
- Filters accept snake_case (`min_age=30`) as well as camelCase.
- `search_all()` generator, `person(id, fields=[…])`, `export("random", …)`.
- `retries` option, retries on `5xx`, fractional `retry-after`.
- Network errors and timeouts raise `ShaqsiyadError` with `status == 0`.
- Ships `py.typed`.

### `shaqsiyad-mcp`
- New tools: `get_stats` (find valid filter values) and `get_avatar` (returns the portrait as an image).
- New `shaqsiyad://people/{id}` resource and `roleplay_user` prompt.
- All 13 filters, including `tier`, `mbti` and `relationship`; `format` on `get_fixtures`.
- Network failures come back as tool errors instead of crashing the call.

### Figma plugin
- Fixed the build (DOM and plugin typings clashed) and a runtime crash: the plugin sandbox has no `URLSearchParams`.

### Repo
- Tests for the JS client and CLI, the Python client and CLI, and the MCP server.
- CI on Node 18/20/22 and Python 3.9/3.11/3.13, plus a contract check that the OpenAPI spec, Postman collection and SDKs agree.
- Tag-driven release workflow for npm and PyPI.

## 0.1.0

First public release: JS and Python SDKs, MCP server, Figma plugin, examples, OpenAPI spec and Postman collection.
