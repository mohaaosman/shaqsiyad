# Roadmap

Everything planned for this repo has shipped. New ideas are welcome in issues.

## ✅ 0.1 — Use it anywhere
- JS and Python SDKs, MCP server, Figma plugin, OpenAPI spec, Postman collection, VS Code snippets, examples.

## ✅ 0.2 — Trust it
- CLI in both SDKs, paging iterators, `fields` trimming, timeouts, retries on `429`/`5xx`.
- MCP: `get_stats`, `get_avatar`, person resource, `roleplay_user` prompt, all 13 filters.
- Tests for every package, CI, contract check, tag-driven releases.

## ✅ 0.3 — Seed anything
- Typed fixture records in the spec and SDKs.
- [Seeder recipes](examples/seeders.md): Prisma, Drizzle, Django, Rails, Supabase, Laravel, Postgres.
- Faker-style adapter (`shaqsiyad/faker`, `shaqsiyad.faker`).
- Offline snapshots: `shaqsiyad pull`, then `snapshot:` in the SDKs or `--snapshot` on the CLI.

## ✅ 0.4 — Design and agents
- Figma: more layers, per-frame filters, repeat grids, big selections, **component properties** and **variable modes**.
- MCP: `find_household_for`, `find_team_for`, `user_panel` prompt.
- SDKs for **Go, PHP, Ruby and C#**, with the same tests as JS and Python.

## ✅ Later — shipped
- React hooks (`shaqsiyad-react`), Storybook loader (`shaqsiyad-storybook`), web [playground](playground).

## Outside this repo

Two things can't be done from this repository. They're listed so nothing is hidden:

- **Publishing** the packages to npm, PyPI, RubyGems, NuGet and Packagist needs the maintainer's registry accounts. Everything else is automated: see [`RELEASING.md`](RELEASING.md).
- **Generator work** lives with the private dataset: locale-specific address and phone formats per country, and documented field layouts for `employees` and `patients` fixtures. When it lands, the SDK types and the contract check pick it up.
