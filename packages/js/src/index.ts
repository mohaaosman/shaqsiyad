export const DEFAULT_BASE_URL = 'https://shaqsiyad.example/api/v1';

export type Gender = 'male' | 'female';
export type Tier = 'radiant' | 'luminous' | 'warm' | 'soft' | 'muted';
export type Format = 'json' | 'csv' | 'ndjson';
export type Shape = 'users' | 'customers' | 'employees' | 'patients';

export interface Filters {
  q?: string;
  gender?: Gender;
  minAge?: number;
  maxAge?: number;
  continent?: string;
  country?: string;
  ethnicity?: string;
  religion?: string;
  tier?: Tier | Tier[];
  mbti?: string;
  relationship?: string;
  industry?: string;
  status?: string;
}

export interface PersonaSummary {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  gender: Gender;
  age: number;
  city: string;
  country: string;
  continent: string;
  ethnicity: string;
  religion: string;
  branch: string;
  title: string;
  industry: string;
  relationship: string;
  mbti: string;
  tier: Tier;
  overall: number;
  tagline: string;
  connections: number;
  initials: string;
  avatar: string;
}

export interface Persona {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  age: number;
  birthDate: string;
  city: string;
  country: string;
  continent: string;
  nationality: string;
  ethnicity: string;
  religion: { name: string; branch: string; observance: 'Devout' | 'Practising' | 'Cultural' | 'Lapsed' | null; practices: string[]; quote: { text: string; source: string } | null; changed: { from: string; year: number; reason: string } | null };
  contact: { email: string; phone: string; address: { street: string; city: string; postcode: string; country: string } };
  avatar: { url: string; sizes: { '64': string; '128': string; '256': string; png: string }; prompt: string; initials: string };
  career: { status: string; title: string; industry: string; company: string | null };
  [field: string]: unknown;
}

export interface SearchResult {
  total: number;
  page: number;
  limit: number;
  pages: number;
  sort: string;
  matched: 'name' | 'all' | 'any' | null;
  results: PersonaSummary[];
}

export interface Graph {
  nodes: PersonaSummary[];
  edges: { source: string; target: string; kind: string; year: number }[];
}

export interface Household {
  head: PersonaSummary;
  partner: string | null;
  children: { name: string; age: number }[];
  address: Persona['contact']['address'];
  size: number;
}

export interface Team {
  industry: string;
  manager: PersonaSummary;
  members: PersonaSummary[];
}

export class ShaqsiyadError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ShaqsiyadError';
  }
}

type Query = Record<string, string | number | boolean | undefined | (string | number)[]>;

export class Shaqsiyad {
  readonly baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    const fromEnv = typeof process !== 'undefined' ? process.env?.SHAQSIYAD_BASE_URL : undefined;
    this.baseUrl = (options.baseUrl ?? fromEnv ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  url(path: string, query: Query = {}): string {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) sp.append(key, String(v));
    }
    const qs = sp.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private async get(path: string, query: Query = {}, retried = false): Promise<Response> {
    const res = await fetch(this.url(path, query));
    if (res.status === 429 && !retried) {
      await new Promise((resolve) => setTimeout(resolve, Number(res.headers.get('retry-after') ?? 1) * 1000));
      return this.get(path, query, true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ShaqsiyadError(res.status, body?.error ?? res.statusText);
    }
    return res;
  }

  private async json<T>(path: string, query: Query = {}): Promise<T> {
    return (await this.get(path, query)).json() as Promise<T>;
  }

  search(params: Filters & { sort?: string; page?: number; limit?: number } = {}): Promise<SearchResult> {
    return this.json('/personas', { ...params });
  }

  random(params: Filters & { count: number; seed?: number }): Promise<Persona[]> {
    return this.json('/personas/random', { ...params });
  }

  person(idOrSlug: string): Promise<Persona> {
    return this.json(`/personas/${encodeURIComponent(idOrSlug)}`);
  }

  graph(idOrSlug: string, depth: 1 | 2 = 1): Promise<Graph> {
    return this.json(`/personas/${encodeURIComponent(idOrSlug)}/graph`, { depth });
  }

  fixtures(shape: Shape, params: Filters & { count?: number; seed?: number } = {}): Promise<Record<string, unknown>[]> {
    return this.json('/fixtures', { shape, ...params });
  }

  async export(kind: 'personas' | 'fixtures', format: Exclude<Format, 'json'>, params: Query = {}): Promise<string> {
    return (await this.get(kind === 'personas' ? '/personas' : '/fixtures', { ...params, format })).text();
  }

  households(params: Filters & { count?: number; seed?: number } = {}): Promise<Household[]> {
    return this.json('/households', { ...params });
  }

  team(params: { size?: number; industry?: string; seed?: number } = {}): Promise<Team> {
    return this.json('/teams', { ...params });
  }

  stats(): Promise<Record<string, unknown>> {
    return this.json('/stats');
  }

  avatarUrl(idOrSlug: string, options: { size?: 64 | 128 | 256 | 512; format?: 'webp' | 'png' } = {}): string {
    return this.url(`/personas/${encodeURIComponent(idOrSlug)}/avatar`, options);
  }

  sheetUrl(params: Filters & { count?: number; seed?: number } = {}): string {
    return this.url('/sheet.png', { ...params });
  }
}
