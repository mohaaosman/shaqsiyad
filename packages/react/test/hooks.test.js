import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h, act, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Shaqsiyad } = await import('shaqsiyad');
const { ShaqsiyadProvider, usePeople, useSearch, usePerson, useFixtures, Avatar } = await import('../dist/index.js');

const BASE = 'https://api.test/v1';

/** A real client whose fetch answers from `respond(url)` after an optional delay, recording each URL. */
function fakeClient(respond, delays = {}) {
  const calls = [];
  const fetch = async (url) => {
    url = String(url);
    calls.push(url);
    const wait = Object.entries(delays).find(([part]) => url.includes(part))?.[1];
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const { status = 200, body } = respond(url);
    return new Response(JSON.stringify(body), { status });
  };
  return { client: new Shaqsiyad({ baseUrl: BASE, fetch, retries: 0 }), calls };
}

let container;
let root;
beforeEach(async () => {
  if (root) await act(() => root.unmount());
  container = document.createElement('div');
  root = createRoot(container);
});

/** Render `useHook` inside a provider; `seen` collects every state the component rendered. */
function render(client, useHook) {
  const seen = [];
  let setProps;
  function Host({ initial }) {
    const [props, set] = useState(initial);
    setProps = set;
    const state = useHook(props);
    seen.push(state);
    return null;
  }
  return {
    seen,
    async mount(initial) {
      await act(async () => root.render(h(ShaqsiyadProvider, { client }, h(Host, { initial }))));
    },
    async update(next) {
      await act(async () => setProps(next));
    },
    last: () => seen[seen.length - 1]
  };
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

test('usePeople loads, then exposes data', async () => {
  const { client, calls } = fakeClient(() => ({ body: [{ id: 'shq_1', fullName: 'Amina Farah' }] }));
  const r = render(client, (p) => usePeople(p));
  await r.mount({ count: 1, seed: 1 });
  await settle();
  assert.equal(r.seen[0].loading, true);
  assert.deepEqual(r.last().data, [{ id: 'shq_1', fullName: 'Amina Farah' }]);
  assert.equal(r.last().loading, false);
  assert.equal(calls[0], `${BASE}/personas/random?count=1&seed=1`);
});

test('identical queries share the cache; refetch bypasses it', async () => {
  const { client, calls } = fakeClient(() => ({ body: [] }));
  const r = render(client, (p) => usePeople(p));
  await r.mount({ count: 2, seed: 9 });
  await settle();
  await r.update({ count: 3, seed: 9 });
  await settle();
  await r.update({ count: 2, seed: 9 });
  await settle();
  assert.equal(calls.length, 2, 'the repeated seed-9 query came from cache');
  await act(async () => r.last().refetch());
  await settle();
  assert.equal(calls.length, 3);
});

test('a slow stale response never overwrites a newer one', async () => {
  const { client } = fakeClient((url) => ({ body: { results: [{ id: url.includes('slow') ? 'old' : 'new' }], total: 1, page: 1, pages: 1 } }), { slow: 60 });
  const r = render(client, (p) => useSearch(p));
  await r.mount({ q: 'slow' });
  await r.update({ q: 'fast' });
  await act(() => new Promise((res) => setTimeout(res, 120)));
  assert.equal(r.last().data.results[0].id, 'new');
  assert.ok(!r.seen.some((s) => s.data?.results[0].id === 'old'), 'the stale result was never rendered');
});

test('errors surface on the state and are not cached', async () => {
  let fail = true;
  const { client, calls } = fakeClient(() => (fail ? { status: 404, body: { error: 'No such person' } } : { body: { id: 'shq_2' } }));
  const r = render(client, (id) => usePerson(id, { fields: ['fullName'] }));
  await r.mount('shq_2');
  await settle();
  assert.equal(r.last().error.message, 'No such person');
  assert.equal(r.last().loading, false);
  assert.equal(calls[0], `${BASE}/personas/shq_2?fields=fullName`);
  fail = false;
  await act(async () => r.last().refetch());
  await settle();
  assert.deepEqual(r.last().data, { id: 'shq_2' });
});

test('usePerson(null) does not fetch', async () => {
  const { client, calls } = fakeClient(() => ({ body: {} }));
  const r = render(client, (id) => usePerson(id));
  await r.mount(null);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(r.last().loading, false);
});

test('useFixtures sends the shape', async () => {
  const { client, calls } = fakeClient(() => ({ body: [{ email: 'a@example.com' }] }));
  const r = render(client, (p) => useFixtures('patients', p));
  await r.mount({ count: 1, seed: 3 });
  await settle();
  assert.equal(calls[0], `${BASE}/fixtures?shape=patients&count=1&seed=3`);
  assert.equal(r.last().data[0].email, 'a@example.com');
});

test('Avatar renders an img, then initials when it fails', async () => {
  const person = { fullName: 'Amina Farah', avatar: 'https://img.test/a.webp' };
  await act(async () => root.render(h(Avatar, { person, size: 48 })));
  const img = container.querySelector('img');
  assert.equal(img.getAttribute('alt'), 'Amina Farah');
  assert.equal(img.getAttribute('width'), '48');
  await act(async () => img.dispatchEvent(new window.Event('error')));
  const fallback = container.querySelector('[role="img"]');
  assert.equal(fallback.textContent, 'AF');
  assert.equal(fallback.getAttribute('aria-label'), 'Amina Farah');
});
