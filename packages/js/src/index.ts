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
    /** HTTP status, or 0 for network errors and timeouts. */
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ShaqsiyadError';
  }
}

export type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

export interface ClientOptions {
  /** API root. Defaults to `SHAQSIYAD_BASE_URL`, then the public API. */
  baseUrl?: string;
  /** A fetch implementation, for tests, proxies or older runtimes. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Abort a request after this many milliseconds. Defaults to 30 000; `0` disables it. */
  timeout?: number;
  /** How many times to retry a `429` or `5xx`, honouring `retry-after`. Defaults to 1. */
  retries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Shaqsiyad {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly retries: number;
  private readonly fetcher: typeof fetch;

  constructor(options: ClientOptions = {}) {
    const fromEnv = typeof process !== 'undefined' ? process.env?.SHAQSIYAD_BASE_URL : undefined;
    this.baseUrl = (options.baseUrl ?? fromEnv ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout ?? 30_000;
    this.retries = options.retries ?? 1;
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  }

  url(path: string, query: Query = {}): string {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      for (const v of Array.isArray(value) ? value : [value]) sp.append(key, String(v));
    }
    const qs = sp.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private async get(path: string, query: Query = {}, attempt = 0): Promise<Response> {
    const signal = this.timeout > 0 && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(this.timeout) : undefined;
    let res: Response;
    try {
      res = await this.fetcher(this.url(path, query), { signal });
    } catch (e) {
      const err = e as Error;
      if (err.name === 'TimeoutError') throw new ShaqsiyadError(0, `Timed out after ${this.timeout}ms`);
      throw new ShaqsiyadError(0, err.message);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < this.retries) {
      const wait = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(wait) && wait > 0 ? wait : 2 ** attempt) * 1000);
      return this.get(path, query, attempt + 1);
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

  /** Every match across all pages, one summary at a time. Stops after `max` people if given. */
  async *searchAll(params: Filters & { sort?: string; limit?: number; max?: number } = {}): AsyncGenerator<PersonaSummary> {
    const { max = Infinity, ...rest } = params;
    let yielded = 0;
    for (let page = 1; ; page++) {
      const result = await this.search({ limit: 100, ...rest, page });
      for (const person of result.results) {
        if (yielded++ >= max) return;
        yield person;
      }
      if (page >= result.pages || result.results.length === 0) return;
    }
  }

  random(params: Filters & { count: number; seed?: number }): Promise<Persona[]> {
    return this.json('/personas/random', { ...params });
  }

  /** One complete person. Pass `fields` to trim the response to those top-level keys. */
  person(idOrSlug: string, options: { fields?: string[] } = {}): Promise<Persona> {
    return this.json(`/personas/${encodeURIComponent(idOrSlug)}`, { fields: options.fields?.join(',') });
  }

  graph(idOrSlug: string, depth: 1 | 2 = 1): Promise<Graph> {
    return this.json(`/personas/${encodeURIComponent(idOrSlug)}/graph`, { depth });
  }

  fixtures(shape: Shape, params: Filters & { count?: number; seed?: number } = {}): Promise<Record<string, unknown>[]> {
    return this.json('/fixtures', { shape, ...params });
  }

  /** Raw CSV or NDJSON: a search (`personas`), random people (`random`) or fixtures. */
  async export(kind: 'personas' | 'random' | 'fixtures', format: Exclude<Format, 'json'>, params: Query = {}): Promise<string> {
    const path = { personas: '/personas', random: '/personas/random', fixtures: '/fixtures' }[kind];
    return (await this.get(path, { ...params, format })).text();
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
