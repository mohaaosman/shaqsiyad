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
const users = await api.fixtures('users', { count: 50, seed: 1 });          // UserFixture[]
const customers = await api.fixtures('customers', { count: 20, seed: 1 }); // CustomerFixture[]
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

## Fixture types

`fixtures(shape)` is typed by shape: `UserFixture`, `CustomerFixture`, `EmployeeFixture`, `PatientFixture`. Every record has `id`, `fullName` and `email`; customers add `customerNumber`, `phone`, `address`, `company`, `incomeBand` and `customerSince`. Records can carry more keys than are typed so far — they're there as `unknown`.

## Offline snapshots

Pull people once, then run tests and CI without the network:

```sh
npx shaqsiyad pull --count 500 --seed 1 --country Kenya --out people.json
```

```ts
const api = new Shaqsiyad({ snapshot: 'people.json' }); // or pass the parsed object (works in browsers)
await api.random({ count: 5, seed: 3, religion: 'Muslim' }); // same seed → same picks, no network
```

Offline, `random`, `search`, `searchAll`, `person`, `fixtures` (`users`, `customers`) and `stats` are served from the file, with the same filters. `graph`, `households`, `team`, `export` and the other fixture shapes need the API and throw a clear error. In code, `pullSnapshot(api, { count, seed, ...filters })` does what `pull` does.

## Faker-style helpers

```ts
import { createFaker } from 'shaqsiyad/faker';

const faker = await createFaker({ seed: 1, count: 100, country: 'Somalia' }); // or { snapshot: 'people.json' }

faker.person.fullName();   // 'Hodan Warsame'
faker.internet.email();    // the same person's email
faker.image.avatar();      // and their face
faker.next();              // move on to the next person
```

Helpers always describe the *current* person, so a name, email, phone, address and face that you read together belong together. `next()` advances (and wraps around after `count`). Available: `person.fullName/firstName/lastName/sex/jobTitle`, `internet.email`, `phone.number`, `location.city/country/streetAddress`, `image.avatar`, plus `current()` and `people`.

## CLI

```sh
npx shaqsiyad random --count 3 --seed 1 --country Somalia
npx shaqsiyad search "nurse who loves jazz" --limit 5
npx shaqsiyad search --religion Hindu --all > hindus.ndjson
npx shaqsiyad fixtures users --count 100 --seed 1 --format csv > users.csv
npx shaqsiyad team --size 6 --industry Healthcare
npx shaqsiyad person shq_00042 --fields fullName,career
npx shaqsiyad pull --count 200 --seed 1 --out people.json
npx shaqsiyad random --count 3 --snapshot people.json      # offline
npx shaqsiyad --help
```

Output is pretty JSON (`--compact` for one line), or raw CSV/NDJSON with `--format`.
