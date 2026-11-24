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

## 🔜 0.3 — Seed anything
- [ ] Typed fixture records (`UserFixture`, `PatientFixture`, …) in the OpenAPI spec and both SDKs.
- [ ] Seeder recipes: Prisma, Drizzle, Django, Rails, Supabase.
- [ ] Faker-style adapter: `shaqsiyad/faker` drop-in for `faker.person.*` backed by seeded people.
- [ ] Offline snapshot: `shaqsiyad pull --seed 1 --count 1000 > people.json` and an SDK option to read from it, for CI without network.

## 🗓 0.4 — Design and agents
- [ ] Figma plugin: more fields (`#phone`, `#company`, `#bio`), per-frame filters, and repeat-grid fill.
- [ ] MCP: `find_household_for` / `find_team_for` helpers and an eval-pack prompt that builds a user panel from a brief.
- [ ] Go and PHP SDKs generated from the spec, with the same tests.

## Later
- Storybook addon and React hooks (`usePeople`).
- Locale-aware fixtures (address and phone formats per country).
- Web playground for building queries and copying them as code.
