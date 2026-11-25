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
cd packages/react && pnpm install && pnpm test        # needs packages/js built
cd packages/storybook && pnpm install && pnpm test    # needs packages/js built
cd figma-plugin && pnpm install && pnpm build && pnpm test
node --test playground/*.test.js
cd packages/go && go vet ./... && go test ./...
cd packages/php && composer install && vendor/bin/phpunit
cd packages/ruby && ruby -Ilib -Itest test/test_shaqsiyad.rb
cd packages/dotnet && dotnet test
python3 scripts/check-contract.py   # spec, Postman and SDKs agree
```

Adding a filter or endpoint? Update `openapi.json`, the Postman collection, every SDK and the MCP server together. The contract check will tell you what you missed (for PHP and Ruby, which pass filters through, it checks endpoints only).

## Releasing

See [`RELEASING.md`](RELEASING.md).
