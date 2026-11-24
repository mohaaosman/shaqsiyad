# Contributing

Thanks for helping.

- **Issues** — bugs in the API, missing filters, people who don't ring true, ideas. All welcome.
- **Pull requests** — welcome for the SDKs, MCP server, Figma plugin, examples and snippets.
- **The dataset** — the generator and data are maintained privately. Suggest new countries, ethnic groups, names or traits in an issue and they'll be added there.

Keep code small and dependency-free where you can. Match the existing style.

## Running the checks

```sh
cd packages/js && pnpm install && pnpm test
cd packages/mcp && pnpm install && pnpm test
cd packages/python && PYTHONPATH=src python -m unittest discover -s tests
cd figma-plugin && pnpm install && pnpm build
python3 scripts/check-contract.py   # spec, Postman and SDKs agree
```

Adding a filter or endpoint? Update `openapi.json`, the Postman collection, both SDKs and the MCP server together — the contract check will tell you what you missed.

## Releasing

Bump the version in the package, add a `CHANGELOG.md` entry, then push a tag: `js-v0.2.0`, `mcp-v0.2.0` or `python-v0.2.0`.
