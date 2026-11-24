# Roadmap

What's shipped in this repo and what comes next. Ideas and votes welcome in issues.

## ✅ 0.1 — Use it anywhere
- JS and Python SDKs, MCP server, Figma plugin, OpenAPI spec, Postman collection, VS Code snippets, examples.

## ✅ 0.2 — Trust it
- CLI in both SDKs (`npx shaqsiyad`, `pipx run shaqsiyad`).
- Paging iterators (`searchAll` / `search_all`), `fields` trimming, timeouts, retries on `429`/`5xx`.
- MCP: `get_stats`, `get_avatar` (image), person resource, `roleplay_user` prompt, all 13 filters.
- Tests for every package, CI matrix, contract check across spec/Postman/SDKs, tag-driven releases.
- Figma plugin build and runtime fixes.

## ✅ 0.3 — Seed anything
- [x] Typed fixture records (`UserFixture`, `CustomerFixture`, `EmployeeFixture`, `PatientFixture`) in the OpenAPI spec and both SDKs.
- [x] Seeder recipes: [Prisma, Drizzle, Django, Rails, Supabase](examples/seeders.md), alongside Laravel and Postgres.
- [x] Faker-style adapter: `shaqsiyad/faker` (JS) and `shaqsiyad.faker` (Python), backed by seeded people.
- [x] Offline snapshot: `shaqsiyad pull --seed 1 --count 1000 --out people.json`, then `snapshot:` in either SDK (or `--snapshot` on the CLI) for CI without network.

## ✅ 0.4 — Design and agents
- [x] Figma plugin: `#phone`, `#company`, `#bio`, `#initials`, `#last`, `#title`; per-frame filters in frame names (`Card [gender=female]`); repeat-grid fill; selections over 50.
- [x] MCP: `find_household_for`, `find_team_for` and a `user_panel` prompt that runs a panel of people against a brief.
- [x] Go and PHP SDKs with the same tests as JS and Python.

## ✅ Later — shipped early
- [x] React hooks (`shaqsiyad-react`: `usePeople`, `useSearch`, `usePerson`, `useFixtures`, `<Avatar>`).
- [x] Storybook loader and decorator (`shaqsiyad-storybook`).
- [x] Web [playground](playground) for building queries and copying them as curl, JS, Python, CLI or Go.

## Generator backlog (not in this repo)
These need the private generator and dataset, so they're tracked there:
- Locale-aware fixtures — address and phone formats per country.
- Documented field layouts for `employees` and `patients` fixtures, so the typed records can cover every field.

## Next
- Publish 0.3 to npm and PyPI, and 0.1 of the Go, PHP, React and Storybook packages.
- Ruby and C# SDKs.
- Figma: component-property fill and variable modes.
