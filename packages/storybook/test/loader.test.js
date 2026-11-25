import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shaqsiyadLoader, peopleLoader, withPeople } from '../dist/index.js';

function fakeClient() {
  const calls = [];
  return {
    calls,
    random: async (params) => {
      calls.push(['random', params]);
      return Array.from({ length: params.count }, (_, i) => ({ id: `shq_${params.seed}_${i}`, fullName: `Person ${i}` }));
    },
    fixtures: async (shape, params) => {
      calls.push(['fixtures', shape, params]);
      return [{ shape, email: 'a@example.com' }];
    }
  };
}

test('shaqsiyadLoader loads fixed people with filters', async () => {
  const client = fakeClient();
  const { people } = await shaqsiyadLoader({ count: 2, seed: 7, country: 'Kenya' }, { client })({});
  assert.equal(people.length, 2);
  assert.deepEqual(client.calls[0], ['random', { country: 'Kenya', count: 2, seed: 7 }]);
});

test('shaqsiyadLoader defaults to 5 people, seed 1, and can load fixtures', async () => {
  const client = fakeClient();
  assert.equal((await shaqsiyadLoader({}, { client })()).people.length, 5);
  assert.deepEqual(client.calls[0][1], { count: 5, seed: 1 });
  const { people } = await shaqsiyadLoader({ shape: 'patients', count: 1 }, { client })();
  assert.equal(people[0].shape, 'patients');
});

test('peopleLoader reads parameters.shaqsiyad and skips stories without it', async () => {
  const client = fakeClient();
  const loader = peopleLoader({ client });
  assert.deepEqual(await loader({ parameters: {} }), {});
  assert.deepEqual(await loader({ parameters: { shaqsiyad: { count: 1, disable: true } } }), {});
  const { people } = await loader({ parameters: { shaqsiyad: { count: 3, seed: 2, filters: { religion: 'Hindu' } } } });
  assert.equal(people.length, 3);
  assert.deepEqual(client.calls, [['random', { religion: 'Hindu', count: 3, seed: 2 }]]);
});

test('withPeople renders immediately, then fills context.loaded.people', async () => {
  const client = fakeClient();
  let reloaded = 0;
  const decorator = withPeople({ client, onLoad: () => reloaded++ });
  const parameters = { shaqsiyad: { count: 2, seed: 4 } };
  const story = (ctx) => ctx.loaded.people.length;

  assert.equal(decorator(story, { parameters }), 0);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reloaded, 1);
  assert.equal(decorator(story, { parameters }), 2);
  assert.equal(client.calls.length, 1);
});

test('withPeople keeps people a loader already provided and ignores stories without parameters', () => {
  const client = fakeClient();
  const decorator = withPeople({ client });
  assert.equal(decorator((ctx) => ctx.loaded.people, { parameters: { shaqsiyad: { count: 1 } }, loaded: { people: ['x'] } })[0], 'x');
  assert.equal(decorator(() => 'plain', { parameters: {} }), 'plain');
  assert.equal(client.calls.length, 0);
});
