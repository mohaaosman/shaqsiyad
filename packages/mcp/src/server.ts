import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const VERSION = '0.2.0';
export const DEFAULT_BASE_URL = 'https://shaqsiyad.example/api/v1';

export interface ServerOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
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
  tier: z.enum(['radiant', 'luminous', 'warm', 'soft', 'muted']).optional().describe('Overall life-satisfaction band'),
  mbti: z.string().regex(/^[EI][NS][FT][JP]$/i).optional().describe('e.g. INFJ'),
  relationship: z.string().optional().describe('Single, Dating, Engaged, Married, Divorced, Widowed'),
  industry: z.string().optional(),
  status: z.string().optional().describe('Employed, Self-employed, Studying, Retired, Between jobs')
};
const seed = z.number().int().min(0).optional().describe('Same seed + same filters returns the same people');

export function createServer(options: ServerOptions = {}): McpServer {
  const baseUrl = (options.baseUrl ?? process.env.SHAQSIYAD_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));

  const url = (path: string, query: Record<string, unknown> = {}) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') sp.append(key, String(value));
    const qs = sp.toString();
    return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
  };

  async function request(path: string, query: Record<string, unknown> = {}): Promise<{ ok: boolean; text: string }> {
    try {
      const res = await fetcher(url(path, query), { signal: AbortSignal.timeout(30_000) });
      return { ok: res.ok, text: await res.text() };
    } catch (e) {
      return { ok: false, text: JSON.stringify({ error: `Could not reach Shaqsiyad at ${baseUrl}: ${(e as Error).message}` }) };
    }
  }

  async function call(path: string, query: Record<string, unknown> = {}) {
    const { ok, text } = await request(path, query);
    return { content: [{ type: 'text' as const, text }], isError: !ok };
  }

  const server = new McpServer({ name: 'shaqsiyad', version: VERSION });

  server.registerTool('search_people', { description: 'Search fictional people by text and filters. Returns summaries.', inputSchema: { ...filters, sort: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() } }, (args) => call('/personas', args));
  server.registerTool('random_people', { description: 'Random fictional people with complete profiles (personality, faith, career, contact, avatar).', inputSchema: { ...filters, count: z.number().int().min(1).max(50), seed } }, (args) => call('/personas/random', args));
  server.registerTool('get_person', { description: 'One complete fictional person by id (shq_00042) or slug.', inputSchema: { id: z.string(), fields: z.string().optional().describe('Comma-separated top-level fields') } }, ({ id, fields }) => call(`/personas/${encodeURIComponent(id)}`, { fields }));
  server.registerTool('get_fixtures', { description: 'Records shaped for seeding an app database: users, customers, employees or patients. Set format to csv or ndjson for raw text.', inputSchema: { shape: z.enum(['users', 'customers', 'employees', 'patients']), count: z.number().int().min(1).max(100).optional(), seed, format: z.enum(['json', 'csv', 'ndjson']).optional(), ...filters } }, (args) => call('/fixtures', args));
  server.registerTool('get_households', { description: 'Fictional people with their partner and children.', inputSchema: { count: z.number().int().min(1).max(25).optional(), seed, ...filters } }, (args) => call('/households', args));
  server.registerTool('get_team', { description: 'A manager and reports from one industry.', inputSchema: { size: z.number().int().min(2).max(20).optional(), industry: z.string().optional(), seed } }, (args) => call('/teams', args));
  server.registerTool('get_graph', { description: 'People connected to a person (shared university, workplace, flight, festival…) as nodes and edges.', inputSchema: { id: z.string(), depth: z.number().int().min(1).max(2).optional() } }, ({ id, depth }) => call(`/personas/${encodeURIComponent(id)}/graph`, { depth }));
  server.registerTool('get_stats', { description: 'Dataset totals and every facet value (countries, ethnic groups, religions, industries…). Use it to pick valid filter values.', inputSchema: {} }, () => call('/stats'));

  server.registerTool(
    'get_avatar',
    { description: "A person's portrait as an image, plus its URL.", inputSchema: { id: z.string(), size: z.union([z.literal(64), z.literal(128), z.literal(256), z.literal(512)]).optional() } },
    async ({ id, size }) => {
      const link = url(`/personas/${encodeURIComponent(id)}/avatar`, { size: size ?? 256, format: 'png' });
      try {
        const res = await fetcher(link, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) return { content: [{ type: 'text' as const, text: await res.text() }], isError: true };
        const data = Buffer.from(await res.arrayBuffer()).toString('base64');
        return { content: [{ type: 'image' as const, data, mimeType: 'image/png' }, { type: 'text' as const, text: link }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Could not fetch avatar: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  server.registerResource(
    'person',
    new ResourceTemplate('shaqsiyad://people/{id}', { list: undefined }),
    { title: 'Fictional person', description: 'A complete Shaqsiyad profile by id or slug', mimeType: 'application/json' },
    async (uri, { id }) => {
      const { text } = await request(`/personas/${encodeURIComponent(String(id))}`);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    }
  );

  server.registerPrompt(
    'roleplay_user',
    {
      description: 'Role-play as a fictional person, staying true to their faith, family, job and personality — for testing products and agents.',
      argsSchema: { id: z.string().describe('Person id or slug'), scenario: z.string().describe('What the user is trying to do, e.g. "open a savings account"') }
    },
    async ({ id, scenario }) => {
      const { ok, text } = await request(`/personas/${encodeURIComponent(id)}`);
      const profile = ok ? text : `(Profile ${id} could not be loaded: ${text})`;
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `You are role-playing this fictional person as a real user of a product. Stay in character: let their age, faith and observance, family, job, money, personality and habits shape what they want, what worries them and how they write. Do not mention that you are an AI or that the person is fictional.\n\nScenario: ${scenario}\n\nProfile:\n${profile}`
            }
          }
        ]
      };
    }
  );

  return server;
}
