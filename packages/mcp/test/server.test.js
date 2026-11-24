import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';

const BASE = 'https://api.test/v1';

async function connect(respond) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return respond(String(url));
  };
  const server = createServer({ baseUrl: BASE, fetch });
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
}

test('lists every tool', async () => {
  const { client } = await connect(() => new Response('{}'));
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['get_avatar', 'get_fixtures', 'get_graph', 'get_households', 'get_person', 'get_stats', 'get_team', 'random_people', 'search_people']);
});

test('random_people forwards filters and returns the body', async () => {
  const { client, calls } = await connect(() => new Response('[{"id":"shq_1"}]'));
  const result = await client.callTool({ name: 'random_people', arguments: { count: 2, seed: 1, country: 'Kenya', tier: 'warm' } });
  assert.equal(result.isError, false);
  assert.equal(result.content[0].text, '[{"id":"shq_1"}]');
  const sent = new URL(calls[0]);
  assert.equal(sent.pathname, '/v1/personas/random');
  assert.deepEqual(Object.fromEntries(sent.searchParams), { count: '2', seed: '1', country: 'Kenya', tier: 'warm' });
});

test('API errors are flagged', async () => {
  const { client } = await connect(() => new Response('{"error":"No such person"}', { status: 404 }));
  const result = await client.callTool({ name: 'get_person', arguments: { id: 'nobody' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No such person/);
});

test('network failures are reported, not thrown', async () => {
  const { client } = await connect(() => {
    throw new TypeError('fetch failed');
  });
  const result = await client.callTool({ name: 'get_stats', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Could not reach/);
});

test('get_avatar returns an image', async () => {
  const { client, calls } = await connect(() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
  const result = await client.callTool({ name: 'get_avatar', arguments: { id: 'shq_1', size: 64 } });
  assert.equal(result.content[0].type, 'image');
  assert.equal(result.content[0].data, Buffer.from([137, 80, 78, 71]).toString('base64'));
  assert.equal(calls[0], `${BASE}/personas/shq_1/avatar?size=64&format=png`);
});

test('person resource and roleplay prompt load the profile', async () => {
  const { client } = await connect(() => new Response('{"id":"shq_1","fullName":"Amina Farah"}'));
  const resource = await client.readResource({ uri: 'shaqsiyad://people/shq_1' });
  assert.match(resource.contents[0].text, /Amina Farah/);
  const prompt = await client.getPrompt({ name: 'roleplay_user', arguments: { id: 'shq_1', scenario: 'open a savings account' } });
  assert.match(prompt.messages[0].content.text, /open a savings account[\s\S]*Amina Farah/);
});
