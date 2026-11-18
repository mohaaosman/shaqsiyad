#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (process.env.SHAQSIYAD_BASE_URL ?? 'https://shaqsiyad.example/api/v1').replace(/\/$/, '');

async function call(path: string, query: Record<string, unknown> = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') sp.append(key, String(value));
  const res = await fetch(`${BASE_URL}${path}${sp.size ? `?${sp}` : ''}`);
  const body = await res.text();
  return { content: [{ type: 'text' as const, text: body }], isError: !res.ok };
}

const filters = {
  q: z.string().optional().describe('Free text: names, places, jobs, traits, tastes, e.g. "nurse who loves jazz"'),
  gender: z.enum(['male', 'female']).optional(),
  minAge: z.number().int().min(20).max(75).optional(),
  maxAge: z.number().int().min(20).max(75).optional(),
  continent: z.string().optional().describe('Africa, Asia, Europe, North America, South America, Oceania'),
  country: z.string().optional(),
  ethnicity: z.string().optional().describe('e.g. Somali, Yoruba, Malaysian Chinese'),
  religion: z.string().optional().describe('e.g. Muslim, Catholic, Hindu, Not religious'),
  industry: z.string().optional(),
  status: z.string().optional().describe('Employed, Self-employed, Studying, Retired, Between jobs')
};
const seed = z.number().int().min(0).optional().describe('Same seed + same filters returns the same people');

const server = new McpServer({ name: 'shaqsiyad', version: '0.1.0' });

server.registerTool('search_people', { description: 'Search fictional people by text and filters. Returns summaries.', inputSchema: { ...filters, limit: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() } }, (args) => call('/personas', args));
server.registerTool('random_people', { description: 'Random fictional people with complete profiles (personality, faith, career, contact, avatar).', inputSchema: { ...filters, count: z.number().int().min(1).max(50), seed } }, (args) => call('/personas/random', args));
server.registerTool('get_person', { description: 'One complete fictional person by id (shq_00042) or slug.', inputSchema: { id: z.string(), fields: z.string().optional().describe('Comma-separated top-level fields') } }, ({ id, fields }) => call(`/personas/${encodeURIComponent(id)}`, { fields }));
server.registerTool('get_fixtures', { description: 'Records shaped for seeding an app database: users, customers, employees or patients.', inputSchema: { shape: z.enum(['users', 'customers', 'employees', 'patients']), count: z.number().int().min(1).max(100).optional(), seed, ...filters } }, (args) => call('/fixtures', args));
server.registerTool('get_households', { description: 'Fictional people with their partner and children.', inputSchema: { count: z.number().int().min(1).max(25).optional(), seed, ...filters } }, (args) => call('/households', args));
server.registerTool('get_team', { description: 'A manager and reports from one industry.', inputSchema: { size: z.number().int().min(2).max(20).optional(), industry: z.string().optional(), seed } }, (args) => call('/teams', args));
server.registerTool('get_graph', { description: 'People connected to a person (shared university, workplace, flight, festival…) as nodes and edges.', inputSchema: { id: z.string(), depth: z.number().int().min(1).max(2).optional() } }, ({ id, depth }) => call(`/personas/${encodeURIComponent(id)}/graph`, { depth }));

await server.connect(new StdioServerTransport());
