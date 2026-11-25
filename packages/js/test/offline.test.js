import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Shaqsiyad, ShaqsiyadError, pullSnapshot, mulberry32, seededShuffle } from '../dist/index.js';
import { createFaker, fakerFrom } from '../dist/faker.js';
import { run } from '../dist/cli.js';

const BASE = 'https://api.test/v1';
const noNetwork = async () => {
  throw new Error('network used in an offline test');
};

const person = (i, over = {}) => ({
  id: `shq_${String(i).padStart(5, '0')}`,
  slug: `person-${i}`,
  fullName: `Person ${i} Example`,
  firstName: `Person`,
  lastName: `${i} Example`,
  gender: i % 2 ? 'female' : 'male',
  age: 20 + i,
  city: i % 3 ? 'Nairobi' : 'Mogadishu',
  country: i % 3 ? 'Kenya' : 'Somalia',
  continent: 'Africa',
  ethnicity: i % 3 ? 'Kikuyu' : 'Somali',
  religion: { name: i % 2 ? 'Muslim' : 'Catholic', branch: '' },
  career: { status: 'Employed', title: i % 4 ? 'Nurse' : 'Engineer', industry: 'Healthcare', company: null },
  contact: { email: `p${i}@example.com`, phone: `+254 700 000 ${i}`, address: { street: `${i} Moi Ave`, city: 'Nairobi', postcode: '00100', country: 'Kenya' } },
  avatar: { url: `/api/v1/personas/shq_${i}/avatar`, sizes: {}, prompt: '', initials: 'PE' },
  ...over
});

const SNAP = { version: 1, createdAt: '2026-11-24T00:00:00Z', baseUrl: BASE, params: {}, people: Array.from({ length: 30 }, (_, i) => person(i + 1)) };
const offline = () => new Shaqsiyad({ baseUrl: BASE, fetch: noNetwork, snapshot: SNAP });

test('mulberry32 and seededShuffle are deterministic', () => {
  assert.deepEqual([mulberry32(1)(), mulberry32(1)()], [mulberry32(1)(), mulberry32(1)()]);
  assert.notDeepEqual(seededShuffle([1, 2, 3, 4, 5, 6], 1), seededShuffle([1, 2, 3, 4, 5, 6], 2));
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5, 6], 9), seededShuffle([1, 2, 3, 4, 5, 6], 9));
});

test('offline random filters and is seeded', async () => {
  const api = offline();
  assert.equal(api.offline, true);
  const a = await api.random({ count: 5, seed: 3, country: 'kenya', religion: 'Muslim', minAge: 22 });
  const b = await api.random({ count: 5, seed: 3, country: 'kenya', religion: 'Muslim', minAge: 22 });
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.equal(a.length, 5);
  for (const p of a) assert.ok(p.country === 'Kenya' && p.religion.name === 'Muslim' && p.age >= 22);
});

test('offline search pages summaries and searchAll walks them', async () => {
  const api = offline();
  const r = await api.search({ q: 'nurse', limit: 4, page: 2 });
  assert.equal(r.page, 2);
  assert.equal(r.results.length, 4);
  assert.equal(typeof r.results[0].religion, 'string');
  const all = [];
  for await (const p of api.searchAll({ q: 'NURSE', limit: 4 })) all.push(p.id);
  assert.equal(all.length, r.total);
});

test('offline person by id or slug, with fields, and 404', async () => {
  const api = offline();
  assert.equal((await api.person('person-3')).id, 'shq_00003');
  assert.deepEqual(Object.keys(await api.person('shq_00003', { fields: ['fullName'] })).sort(), ['fullName', 'id']);
  await assert.rejects(api.person('nobody'), (e) => e instanceof ShaqsiyadError && e.status === 404);
});

test('offline fixtures map users and customers; others refuse clearly', async () => {
  const api = offline();
  const users = await api.fixtures('users', { count: 3, seed: 1 });
  assert.deepEqual(Object.keys(users[0]).sort(), ['email', 'fullName', 'id']);
  const customers = await api.fixtures('customers', { count: 2, seed: 1 });
  assert.equal(customers[0].address.city, 'Nairobi');
  assert.ok(customers[0].phone);
  await assert.rejects(api.fixtures('patients'), /not available offline/);
  await assert.rejects(api.households(), /not available offline/);
  await assert.rejects(api.graph('shq_00001'), /not available offline/);
});

test('offline stats count facets', async () => {
  const s = await offline().stats();
  assert.equal(s.total, 30);
  assert.equal(s.source, 'snapshot');
  assert.equal(s.country.Kenya + s.country.Somalia, 30);
});

test('snapshot loads from a file path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shq-'));
  const file = join(dir, 'people.json');
  await writeFile(file, JSON.stringify(SNAP));
  const api = new Shaqsiyad({ fetch: noNetwork, snapshot: file });
  assert.equal((await api.random({ count: 2, seed: 1 })).length, 2);
});

test('pullSnapshot batches by 50 with consecutive seeds', async () => {
  const calls = [];
  const fetch = async (url) => {
    const u = new URL(url);
    calls.push(Object.fromEntries(u.searchParams));
    const seed = Number(u.searchParams.get('seed'));
    const n = Number(u.searchParams.get('count'));
    return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => person(seed * 1000 + i))));
  };
  const snap = await pullSnapshot(new Shaqsiyad({ baseUrl: BASE, fetch }), { count: 120, seed: 5, country: 'Kenya' });
  assert.equal(snap.version, 1);
  assert.equal(snap.people.length, 120);
  assert.deepEqual(calls.map((c) => [c.count, c.seed, c.country]), [['50', '5', 'Kenya'], ['50', '6', 'Kenya'], ['20', '7', 'Kenya']]);
  assert.deepEqual(snap.params, { country: 'Kenya', count: 120, seed: 5 });
});

test('pullSnapshot stops when the API runs out of matches', async () => {
  const fetch = async () => new Response(JSON.stringify([person(1), person(2)]));
  const snap = await pullSnapshot(new Shaqsiyad({ baseUrl: BASE, fetch }), { count: 100 });
  assert.equal(snap.people.length, 2);
});

test('cli pull writes a snapshot and --snapshot reads it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shq-'));
  const file = join(dir, 'people.json');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const n = Number(new URL(url).searchParams.get('count'));
    return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => person(i + 1))));
  };
  try {
    let text = '';
    await run(['pull', '--count', '7', '--seed', '2', '--out', file, '--base-url', BASE], (t) => (text += t));
    assert.match(text, /Saved 7 people/);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(JSON.parse(await readFile(file, 'utf8')).people.length, 7);
  globalThis.fetch = noNetwork;
  try {
    let text = '';
    await run(['random', '--count', '2', '--seed', '1', '--snapshot', file, '--compact'], (t) => (text += t));
    assert.equal(JSON.parse(text).length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('faker helpers describe the current person until next()', async () => {
  const faker = await createFaker({ seed: 4, count: 10, snapshot: SNAP, baseUrl: BASE });
  const first = faker.current();
  assert.equal(faker.person.fullName(), first.fullName);
  assert.equal(faker.internet.email(), first.contact.email);
  assert.equal(faker.location.streetAddress(), first.contact.address.street);
  assert.equal(faker.person.lastName(), first.lastName);
  assert.equal(faker.image.avatar(), `https://api.test${first.avatar.url}`);
  const second = faker.next();
  assert.notEqual(second.id, first.id);
  assert.equal(faker.person.fullName(), second.fullName);
  for (let i = 0; i < 9; i++) faker.next();
  assert.equal(faker.current().id, first.id, 'wraps around after the last person');

  const again = await createFaker({ seed: 4, count: 10, snapshot: SNAP });
  assert.deepEqual(again.people.map((p) => p.id), faker.people.map((p) => p.id));
});

test('faker online preloads via the API and refuses an empty pool', async () => {
  const fetch = async (url) => new Response(JSON.stringify(Array.from({ length: Number(new URL(url).searchParams.get('count')) }, (_, i) => person(i + 1))));
  const faker = await createFaker({ baseUrl: BASE, fetch, count: 3 });
  assert.equal(faker.people.length, 3);
  assert.equal(faker.person.sex(), 'female');
  assert.throws(() => fakerFrom([]), /No people matched/);
});

test('offline sort=name uses code-point order, matching the Python SDK', async () => {
  const names = ['Émile Dubois', 'Zainab Ali', 'Özil M', 'amina farah', 'Amina Farah'];
  const snapshot = { version: 1, createdAt: '', baseUrl: BASE, params: {}, people: names.map((n, i) => person(i + 1, { fullName: n })) };
  const api = new Shaqsiyad({ snapshot, fetch: noNetwork });
  const sorted = (await api.search({ sort: 'name', limit: 10 })).results.map((p) => p.fullName);
  assert.deepEqual(sorted, ['Amina Farah', 'Zainab Ali', 'amina farah', 'Émile Dubois', 'Özil M']);
});
