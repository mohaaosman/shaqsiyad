# Shaqsiyad

**Fictional people with whole lives — for your demos, tests, mockups and agents.**

Faces, names from 137 ethnic groups, faith, careers, tastes, families and the people they've crossed paths with. Free JSON API, no keys.

⭐ **If this saves you from another table of "John Smith"s, star the repo.** It's how other developers find it.

---

## Why

- **Not all John Smith.** Somali, Yoruba, Tamil, Malay, Quechua, Pākehā… names come from real naming traditions and match each person's ethnic group.
- **Whole people.** Personality (Big Five, MBTI), childhood, education, jobs, relationships, faith and observance, hobbies, music, food, daily habits, life events.
- **Faces.** 184 illustrated portraits matched by heritage, gender, age and hijab.
- **Safe.** Everyone is fictional. Emails use `example.com`-style domains, phones sit in fictional ranges.
- **Repeatable.** Same `seed` + same filters → same people, forever.

## Quickstart

```sh
curl "https://shaqsiyad.example/api/v1/personas/random?count=3&seed=1"
```

```ts
import { Shaqsiyad } from 'shaqsiyad';           // pnpm add shaqsiyad
const people = await new Shaqsiyad().random({ count: 5, seed: 1 });
```

```python
from shaqsiyad import Shaqsiyad                   # pip install shaqsiyad
people = Shaqsiyad().random(5, seed=1)
```

```sh
claude mcp add shaqsiyad -- npx -y shaqsiyad-mcp  # agents get the people too
```

## Endpoints

Base URL: `https://shaqsiyad.example/api/v1` · Spec: [`openapi.json`](openapi.json) · Postman: [`postman/`](postman)

| Endpoint | What you get |
|---|---|
| `GET /personas` | Search + 13 filters (ethnicity, religion, age, country, job…), paging, `format=csv\|ndjson` |
| `GET /personas/random` | Random people, seedable |
| `GET /personas/{id}` | One complete person, trim with `fields=` |
| `GET /personas/{id}/graph` | Who they're connected to, as nodes + edges |
| `GET /personas/{id}/avatar` | Portrait: 64, 128, 256 (square) or 512; WebP or PNG |
| `GET /fixtures` | `users`, `customers`, `employees`, `patients` records for seeding |
| `GET /households` | A person with partner and children |
| `GET /teams` | A manager and reports in one industry |
| `GET /sheet.png` | A PNG grid of faces and names |
| `GET /stats` | Totals and every facet |

Each profile also has a 1200×630 share card at `/people/{slug}/card.png`, used as its link preview.

## Use it for

| | |
|---|---|
| **Seeding dev/staging databases** | `/fixtures?shape=users&count=100&seed=1&format=csv` — realistic, GDPR-safe |
| **Design mockups** | [Figma plugin](figma-plugin): name layers `#name`, `#avatar`, `#job` and fill a whole screen |
| **Sales demos** | Believable CRM, HR, bank and clinic screens |
| **QA** | Diacritics, hyphens, long and short names, many scripts' transliterations |
| **AI agents + evals** | Role-play users with real constraints (faith, family, job) via the MCP server |
| **Teaching** | A rich, safe dataset for SQL, pandas and charts classes |
| **Games + fiction** | NPCs with histories and relationships |

## In this repo

| Folder | |
|---|---|
| [`packages/js`](packages/js) | `shaqsiyad` on npm — typed, zero dependencies |
| [`packages/python`](packages/python) | `shaqsiyad` on PyPI — standard library only |
| [`packages/mcp`](packages/mcp) | `shaqsiyad-mcp` — MCP server for Claude and other agents |
| [`figma-plugin`](figma-plugin) | Fill frames with people |
| [`examples`](examples) | curl, fetch, Python, Laravel seeder, React list, Postgres CSV import |
| [`vscode`](vscode) | Snippets |
| [`openapi.json`](openapi.json), [`postman`](postman) | The contract |

The generator, the dataset and the site are maintained privately; this repo holds everything you need to use them.

## Fair use

Free for demos, tests, prototypes, teaching and personal projects. 120 requests a minute per IP (you get a `429` with `retry-after` above that). Responses carry ETags. Please don't scrape the whole dataset.

## Licence

Code in this repository: [MIT](LICENSE). The people, names and portraits served by the API are not covered by the MIT licence.
