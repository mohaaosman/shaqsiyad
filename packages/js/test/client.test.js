import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shaqsiyad, ShaqsiyadError } from '../dist/index.js';
import { parseArgs, run } from '../dist/cli.js';

const BASE = 'https://api.test/v1';

/** A fetch that answers from a queue of responses and records every URL it was asked for. */
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    const { status = 200, body = {}, headers = {} } = next;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
  };
  fn.calls = calls;
  return fn;
}

const page = (n, pages, ids) => ({ total: 0, page: n, limit: ids.length, pages, sort: 'relevance', matched: null, results: ids.map((id) => ({ id })) });

test('builds URLs, skipping empty values and repeating arrays', () => {
  const api = new Shaqsiyad({ baseUrl: `${BASE}/` });
  assert.equal(api.url('/personas', { q: 'nurse', tier: ['warm', 'soft'], gender: undefined, country: '', page: null }), `${BASE}/personas?q=nurse&tier=warm&tier=soft`);
  assert.equal(api.avatarUrl('amina farah', { size: 128 }), `${BASE}/personas/amina%20farah/avatar?size=128`);
});

test('random sends filters and returns the body', async () => {
  const fetch = fakeFetch({ body: [{ id: 'shq_1' }] });
  const people = await new Shaqsiyad({ baseUrl: BASE, fetch }).random({ count: 2, seed: 7, minAge: 30 });
  assert.deepEqual(people, [{ id: 'shq_1' }]);
  assert.equal(fetch.calls[0], `${BASE}/personas/random?count=2&seed=7&minAge=30`);
});

test('person passes fields as a comma list', async () => {
  const fetch = fakeFetch({ body: { id: 'shq_1' } });
  await new Shaqsiyad({ baseUrl: BASE, fetch }).person('shq_1', { fields: ['fullName', 'career'] });
  assert.equal(fetch.calls[0], `${BASE}/personas/shq_1?fields=fullName%2Ccareer`);
});

test('errors carry status and the API message', async () => {
  const api = new Shaqsiyad({ baseUrl: BASE, fetch: fakeFetch({ status: 404, body: { error: 'No such person' } }) });
  await assert.rejects(api.person('nobody'), (e) => e instanceof ShaqsiyadError && e.status === 404 && e.message === 'No such person');
});

test('network failures become ShaqsiyadError with status 0', async () => {
  const api = new Shaqsiyad({ baseUrl: BASE, fetch: fakeFetch(new TypeError('fetch failed')) });
  await assert.rejects(api.stats(), (e) => e instanceof ShaqsiyadError && e.status === 0);
});

test('retries 429 after retry-after, then succeeds', async () => {
  const fetch = fakeFetch({ status: 429, headers: { 'retry-after': '0.01' } }, { body: { total: 1 } });
  assert.deepEqual(await new Shaqsiyad({ baseUrl: BASE, fetch }).stats(), { total: 1 });
  assert.equal(fetch.calls.length, 2);
});

test('gives up after the configured retries', async () => {
  const fetch = fakeFetch({ status: 503, headers: { 'retry-after': '0.01' }, body: { error: 'down' } });
  await assert.rejects(new Shaqsiyad({ baseUrl: BASE, fetch, retries: 2 }).stats(), (e) => e.status === 503);
  assert.equal(fetch.calls.length, 3);
});

test('does not retry other client errors', async () => {
  const fetch = fakeFetch({ status: 400, body: { error: 'bad' } });
  await assert.rejects(new Shaqsiyad({ baseUrl: BASE, fetch }).stats());
  assert.equal(fetch.calls.length, 1);
});

test('searchAll walks every page and honours max', async () => {
  const fetch = fakeFetch({ body: page(1, 3, ['a', 'b']) }, { body: page(2, 3, ['c', 'd']) }, { body: page(3, 3, ['e']) });
  const api = new Shaqsiyad({ baseUrl: BASE, fetch });
  const ids = [];
  for await (const p of api.searchAll({ q: 'nurse', limit: 2 })) ids.push(p.id);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd', 'e']);
  assert.match(fetch.calls[2], /page=3/);

  const few = [];
  const fetch2 = fakeFetch({ body: page(1, 3, ['a', 'b']) }, { body: page(2, 3, ['c', 'd']) });
  for await (const p of new Shaqsiyad({ baseUrl: BASE, fetch: fetch2 }).searchAll({ max: 3, limit: 2 })) few.push(p.id);
  assert.deepEqual(few, ['a', 'b', 'c']);
});

test('export returns raw text for each kind', async () => {
  const fetch = fakeFetch({ body: 'id,name\n1,A\n' });
  const api = new Shaqsiyad({ baseUrl: BASE, fetch });
  assert.equal(await api.export('random', 'csv', { count: 1 }), 'id,name\n1,A\n');
  await api.export('fixtures', 'ndjson', { shape: 'users' });
  assert.equal(fetch.calls[0], `${BASE}/personas/random?count=1&format=csv`);
  assert.equal(fetch.calls[1], `${BASE}/fixtures?shape=users&format=ndjson`);
});

test('parseArgs handles --k v, --k=v, flags and positionals', () => {
  assert.deepEqual(parseArgs(['search', 'jazz nurse', '--limit', '5', '--country=Kenya', '--all', '-h']), {
    positional: ['search', 'jazz nurse'],
    flags: { limit: '5', country: 'Kenya', all: true, help: true }
  });
});

test('cli prints help and builds avatar URLs without network', async () => {
  let text = '';
  await run([], (t) => (text += t));
  assert.match(text, /Usage/);
  text = '';
  await run(['avatar', 'shq_1', '--size', '64', '--base-url', BASE], (t) => (text += t));
  assert.equal(text, `${BASE}/personas/shq_1/avatar?size=64\n`);
});

test('an empty SHAQSIYAD_BASE_URL falls back to the public API', () => {
  const old = process.env.SHAQSIYAD_BASE_URL;
  process.env.SHAQSIYAD_BASE_URL = '';
  try {
    assert.equal(new Shaqsiyad().baseUrl, 'https://shaqsiyad.example/api/v1');
  } finally {
    if (old === undefined) delete process.env.SHAQSIYAD_BASE_URL;
    else process.env.SHAQSIYAD_BASE_URL = old;
  }
});

test('boolean flags never swallow the next argument', () => {
  assert.deepEqual(parseArgs(['search', '--all', 'nurse', '--compact', 'x']), { positional: ['search', 'nurse', 'x'], flags: { all: true, compact: true } });
});
