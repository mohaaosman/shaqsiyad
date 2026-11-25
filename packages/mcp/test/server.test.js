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
  assert.deepEqual(names, ['find_household_for', 'find_team_for', 'get_avatar', 'get_fixtures', 'get_graph', 'get_households', 'get_person', 'get_stats', 'get_team', 'random_people', 'search_people']);
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

const amina = { id: 'shq_00042', fullName: 'Amina Farah', country: 'Kenya', ethnicity: 'Somali', religion: { name: 'Muslim' }, career: { title: 'Nurse', industry: 'Healthcare', status: 'Employed' } };
const route = (routes) => (url) => {
  const { pathname } = new URL(url);
  for (const [path, body] of Object.entries(routes)) if (pathname.endsWith(path)) return new Response(JSON.stringify(body));
  return new Response('{"error":"No such person"}', { status: 404 });
};

test('find_household_for matches country, ethnicity and religion with a stable seed', async () => {
  const { client, calls } = await connect(route({ '/personas/shq_00042': amina, '/households': [{ size: 4 }] }));
  const result = await client.callTool({ name: 'find_household_for', arguments: { id: 'shq_00042' } });
  assert.equal(result.isError ?? false, false);
  const body = JSON.parse(result.content[0].text);
  assert.deepEqual(body.households, [{ size: 4 }]);
  assert.equal(body.anchor.fullName, 'Amina Farah');
  const sent = new URL(calls[1]);
  assert.deepEqual(Object.fromEntries(sent.searchParams), { country: 'Kenya', ethnicity: 'Somali', religion: 'Muslim', count: '1', seed: '42' });
});

test('find_team_for uses the person industry and names the anchor', async () => {
  const { client, calls } = await connect(route({ '/personas/shq_00042': amina, '/teams': { industry: 'Healthcare', members: [] } }));
  const result = await client.callTool({ name: 'find_team_for', arguments: { id: 'shq_00042', size: 4 } });
  assert.match(result.content[0].text, /Amina Farah \(shq_00042\).*anchor/);
  assert.equal(JSON.parse(result.content[1].text).team.industry, 'Healthcare');
  assert.deepEqual(Object.fromEntries(new URL(calls[1]).searchParams), { industry: 'Healthcare', size: '4', seed: '42' });
});

test('find_team_for explains when the person has no industry', async () => {
  const student = { ...amina, career: { status: 'Studying', title: 'Student' } };
  const { client, calls } = await connect(route({ '/personas/shq_00042': student }));
  const result = await client.callTool({ name: 'find_team_for', arguments: { id: 'shq_00042' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no industry.*Studying/);
  assert.equal(calls.length, 1);
});

test('find_household_for passes through a missing person as an error', async () => {
  const { client } = await connect(route({}));
  const result = await client.callTool({ name: 'find_household_for', arguments: { id: 'nobody' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No such person/);
});

test('user_panel loads a seeded panel and frames the session', async () => {
  const { client, calls } = await connect(route({ '/personas/random': [amina] }));
  const prompt = await client.getPrompt({ name: 'user_panel', arguments: { brief: 'a round-up savings app', size: '3', seed: '9' } });
  const text = prompt.messages[0].content.text;
  assert.match(text, /panel of 3 fictional people \(seed 9\)/);
  assert.match(text, /a round-up savings app[\s\S]*Amina Farah/);
  assert.deepEqual(Object.fromEntries(new URL(calls[0]).searchParams), { count: '3', seed: '9' });

  await client.getPrompt({ name: 'user_panel', arguments: { brief: 'x', size: '99' } });
  assert.deepEqual(Object.fromEntries(new URL(calls[1]).searchParams), { count: '12', seed: '1' });
});
