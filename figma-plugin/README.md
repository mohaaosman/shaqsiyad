# Shaqsiyad for Figma

Fill mockups with fictional people: names, jobs, cities and faces.

## Name your layers

| Layer name | Gets |
|---|---|
| `#name` | Full name |
| `#first` | First name |
| `#age` | Age |
| `#job` | Job title |
| `#city`, `#country` | Where they live |
| `#email` | Fictional email (example.com) |
| `#tagline` | One-line quote |
| `#ethnicity`, `#religion` | Background |
| `#avatar` | Portrait as an image fill (any shape or frame) |

Select one frame per person (cards, rows, chat bubbles) and press **Fill selection**. Set a seed to get the same people again.

## Run locally

```sh
pnpm install && pnpm build
```

Figma → Plugins → Development → Import plugin from manifest → pick `manifest.json`.
