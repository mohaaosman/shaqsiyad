import { test } from 'node:test';
import assert from 'node:assert/strict';
import { params, requestUrl, snippets, ENDPOINTS, FILTERS } from './codegen.js';

const state = (over) => ({ baseUrl: '', endpoint: 'random', count: 3, seed: 1, filters: {}, ...over });

test('builds the URL with filters and drops blanks and json format', () => {
  const url = requestUrl(state({ filters: { country: 'Kenya', minAge: '30', religion: '' }, format: 'json' }));
  assert.equal(url, 'https://shaqsiyad.example/api/v1/personas/random?minAge=30&country=Kenya&count=3&seed=1');
});

test('only sends params the endpoint takes', () => {
  assert.equal(requestUrl(state({ endpoint: 'team', size: 6, industry: 'Healthcare', filters: { country: 'Kenya' } })), 'https://shaqsiyad.example/api/v1/teams?size=6&industry=Healthcare&seed=1');
  assert.equal(requestUrl(state({ endpoint: 'stats' })), 'https://shaqsiyad.example/api/v1/stats');
  assert.deepEqual(params(state({ endpoint: 'fixtures', shape: 'patients' }))[0], ['shape', 'patients']);
  assert.ok(!params(state({ shape: 'patients' })).some(([k]) => k === 'shape'));
});

test('encodes values and respects a custom base URL', () => {
  assert.equal(requestUrl(state({ baseUrl: 'http://localhost:8000/api/v1/', endpoint: 'search', count: '', seed: '', filters: { q: 'nurse & jazz' } })), 'http://localhost:8000/api/v1/personas?q=nurse%20%26%20jazz');
});

test('every endpoint produces every snippet', () => {
  for (const endpoint of Object.keys(ENDPOINTS)) {
    const s = snippets(state({ endpoint, shape: 'users', filters: { country: 'Kenya' } }));
    assert.deepEqual(Object.keys(s), ['curl', 'javascript', 'python', 'cli', 'go']);
    for (const text of Object.values(s)) assert.ok(text.length > 10, `${endpoint}: empty snippet`);
  }
  assert.equal(FILTERS.length, 13);
});

test('random snippets', () => {
  const s = snippets(state({ filters: { country: "Côte d'Ivoire", minAge: 30 } }));
  assert.equal(s.curl, `curl 'https://shaqsiyad.example/api/v1/personas/random?minAge=30&country=C%C3%B4te%20d'\\''Ivoire&count=3&seed=1'`);
  assert.match(s.javascript, /api\.random\(\{ minAge: 30, country: 'Côte d\\'Ivoire', count: 3, seed: 1 \}\)/);
  assert.match(s.javascript, /new Shaqsiyad\(\);/);
  assert.match(s.python, /api\.random\(3, min_age=30, country="Côte d'Ivoire", seed=1\)/);
  assert.equal(s.cli, `npx shaqsiyad random --minAge 30 --country 'Côte d'\\''Ivoire' --count 3 --seed 1`);
  assert.match(s.go, /client\.Random\(ctx, shaqsiyad\.RandomParams\{Filters: shaqsiyad\.Filters\{MinAge: 30, Country: "Côte d'Ivoire"\}, Count: 3, Seed: shaqsiyad\.Seed\(1\)\}\)/);
});

test('search puts the text first', () => {
  const s = snippets(state({ endpoint: 'search', count: '', seed: '', limit: 10, filters: { q: 'nurse', gender: 'female' } }));
  assert.match(s.python, /api\.search\("nurse", gender="female", limit=10\)/);
  assert.equal(s.cli, 'npx shaqsiyad search nurse --gender female --limit 10');
  assert.match(s.javascript, /api\.search\(\{ q: 'nurse', gender: 'female', limit: 10 \}\)/);
});

test('fixtures with csv use export', () => {
  const s = snippets(state({ endpoint: 'fixtures', shape: 'employees', format: 'csv' }));
  assert.match(s.javascript, /api\.export\('fixtures', 'csv', \{ shape: 'employees', count: 3, seed: 1 \}\)/);
  assert.match(s.python, /api\.export\("fixtures", "csv", shape="employees", count=3, seed=1\)/);
  assert.equal(s.cli, 'npx shaqsiyad fixtures employees --count 3 --seed 1 --format csv');
  assert.doesNotMatch(s.go, /Format/);
});

test('custom base URL reaches every client', () => {
  const s = snippets(state({ baseUrl: 'http://localhost:8000/api/v1' }));
  assert.match(s.javascript, /new Shaqsiyad\(\{ baseUrl: 'http:\/\/localhost:8000\/api\/v1' \}\)/);
  assert.match(s.python, /Shaqsiyad\(base_url="http:\/\/localhost:8000\/api\/v1"\)/);
  assert.match(s.cli, /--base-url http:\/\/localhost:8000\/api\/v1$/);
  assert.match(s.go, /WithBaseURL\("http:\/\/localhost:8000\/api\/v1"\)/);
});

test('unknown endpoints throw', () => {
  assert.throws(() => requestUrl(state({ endpoint: 'nope' })), /Unknown endpoint/);
});
