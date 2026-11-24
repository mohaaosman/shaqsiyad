# shaqsiyad

Typed client and CLI for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Zero dependencies. Works in Node 18+, browsers, Deno and Bun.

```sh
pnpm add shaqsiyad
```

```ts
import { Shaqsiyad } from 'shaqsiyad';

const api = new Shaqsiyad();

const nurses = await api.search({ q: 'nurse', continent: 'Africa', limit: 10 });
const cast = await api.random({ count: 8, minAge: 25, maxAge: 40, seed: 7 });
const amina = await api.person(cast[0].id, { fields: ['fullName', 'career', 'religion'] });
const users = await api.fixtures('users', { count: 50, seed: 1 });
const csv = await api.export('fixtures', 'csv', { shape: 'employees', count: 100, seed: 2 });
const face = api.avatarUrl(cast[0].id, { size: 128 });

// Every match, across pages
for await (const person of api.searchAll({ religion: 'Muslim', country: 'Kenya', max: 500 })) {
  console.log(person.fullName);
}
```

Same `seed` + same filters → same people, every time.

## Options

```ts
new Shaqsiyad({
  baseUrl: 'http://localhost:8000/api/v1', // or set SHAQSIYAD_BASE_URL
  timeout: 10_000,                         // ms, default 30 000; 0 = none
  retries: 2,                              // retries on 429/5xx, default 1
  fetch: myFetch                           // custom fetch for tests or proxies
});
```

Errors throw `ShaqsiyadError` with `status` (0 for network errors and timeouts) and the API's message. A `429` or `5xx` is retried after `retry-after`.

## CLI

```sh
npx shaqsiyad random --count 3 --seed 1 --country Somalia
npx shaqsiyad search "nurse who loves jazz" --limit 5
npx shaqsiyad search --religion Hindu --all > hindus.ndjson
npx shaqsiyad fixtures users --count 100 --seed 1 --format csv > users.csv
npx shaqsiyad team --size 6 --industry Healthcare
npx shaqsiyad person shq_00042 --fields fullName,career
npx shaqsiyad --help
```

Output is pretty JSON (`--compact` for one line), or raw CSV/NDJSON with `--format`.
