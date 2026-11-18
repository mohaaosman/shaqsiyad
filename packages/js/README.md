# shaqsiyad

Typed client for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Zero dependencies. Works in Node 18+, browsers, Deno and Bun.

```sh
pnpm add shaqsiyad
```

```ts
import { Shaqsiyad } from 'shaqsiyad';

const api = new Shaqsiyad();

const nurses = await api.search({ q: 'nurse', continent: 'Africa', limit: 10 });
const cast = await api.random({ count: 8, minAge: 25, maxAge: 40, seed: 7 });
const users = await api.fixtures('users', { count: 50, seed: 1 });
const csv = await api.export('fixtures', 'csv', { shape: 'employees', count: 100, seed: 2 });
const face = api.avatarUrl(cast[0].id, { size: 128 });
```

Same `seed` + same filters → same people, every time.

Set `SHAQSIYAD_BASE_URL` or pass `new Shaqsiyad({ baseUrl })` to point somewhere else.

Errors throw `ShaqsiyadError` with `status` and the API's message. A `429` is retried once after `retry-after`.
