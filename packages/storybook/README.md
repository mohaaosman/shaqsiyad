# shaqsiyad-storybook

Seeded fictional people for your Storybook stories, from the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Works with any Storybook framework. No dependencies apart from `shaqsiyad`.

```sh
pnpm add -D shaqsiyad shaqsiyad-storybook
```

## One story

```tsx
import { shaqsiyadLoader } from 'shaqsiyad-storybook';

export const Kenya = {
  loaders: [shaqsiyadLoader({ count: 3, seed: 7, country: 'Kenya' })],
  render: (args, { loaded: { people } }) => <ContactList people={people} />
};
```

## Every story, tuned with parameters

```ts
// .storybook/preview.ts
import { peopleLoader } from 'shaqsiyad-storybook';

export default { loaders: [peopleLoader()] };
```

```tsx
export const Patients = {
  parameters: { shaqsiyad: { shape: 'patients', count: 8, seed: 2 } },
  render: (args, { loaded: { people } }) => <PatientTable rows={people} />
};

export const Muslim = {
  parameters: { shaqsiyad: { count: 4, filters: { religion: 'Muslim', minAge: 60 } } }
};
```

Stories without `parameters.shaqsiyad` (or with `disable: true`) load nothing.

| Parameter | Default | |
|---|---|---|
| `count` | 5 | How many |
| `seed` | 1 | Same seed → same people in every render, screenshot and CI run |
| `filters` | — | Any API filter: `country`, `religion`, `minAge`, `industry`… |
| `shape` | — | `users`, `customers`, `employees` or `patients` fixture records instead of people |

## Decorator

Where loaders can't run, `withPeople({ onLoad })` renders the story with `context.loaded.people = []`, fetches, then calls `onLoad` so you can re-render. Prefer the loaders.

## Options

All three accept `{ client }` (a `Shaqsiyad` instance with your timeout/retries/fetch) or `{ baseUrl }`. Responses from the default client are cached for the session.

## Develop

```sh
(cd ../js && pnpm install && pnpm build)
pnpm install && pnpm test
```
