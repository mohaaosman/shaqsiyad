# Shaqsiyad for Figma

Fill mockups with fictional people: names, jobs, cities and faces.

## Name your layers

| Layer name | Gets |
|---|---|
| `#name` | Full name |
| `#first`, `#last` | First name, last name |
| `#initials` | Initials, e.g. `AH` |
| `#age` | Age |
| `#job` or `#title` | Job title |
| `#company` | Employer (empty if self-employed, studying…) |
| `#city`, `#country` | Where they live |
| `#email` | Fictional email (example.com) |
| `#phone` | Fictional phone number |
| `#tagline` | One-line quote |
| `#bio` | Short bio (falls back to the tagline) |
| `#ethnicity`, `#religion` | Background |
| `#avatar` | Portrait as an image fill (any shape or frame) |

Select one frame per person (cards, rows, chat bubbles) and press **Fill selection**. Set a seed to get the same people again. Any number of frames works; more than 50 are fetched in batches (seed, seed+1, …).

## Repeat grids

Select a single frame whose direct children all share a name — an auto-layout list of `Row`s, a grid of `Card` instances — and each child gets its own person.

## Per-frame filters

Add filters in square brackets at the end of a frame's name. They override the panel's settings for that frame:

```
Card [gender=female, country=Kenya]
Row [religion=Hindu, minAge=60]
Team list [industry=Healthcare]      ← on a repeat-grid parent, applies to every row
```

Keys: `q`, `gender`, `minAge`, `maxAge`, `continent`, `country`, `ethnicity`, `religion`, `tier`, `mbti`, `relationship`, `industry`, `status`. Layer names like `#name [gender=male]` still match `#name`.

## Run locally

```sh
pnpm install && pnpm build   # type-checks, then bundles code.ts + logic.ts into dist/code.js
pnpm test                    # unit tests for the pure logic in logic.ts
```

Figma → Plugins → Development → Import plugin from manifest → pick `manifest.json`.
