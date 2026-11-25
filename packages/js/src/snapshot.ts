import type { Filters, Persona, PersonaSummary, SearchResult, Shape, UserFixture, CustomerFixture } from './index.js';

/** A file written by `shaqsiyad pull`: people saved for offline use. */
/** Plain code-point order, the same as Python's default string sort, so offline pages match across SDKs. */
function byCodePoint(a: string, b: string): number {
  const x = Array.from(a ?? '', (c) => c.codePointAt(0)!);
  const y = Array.from(b ?? '', (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

export interface Snapshot {
  version: 1;
  createdAt: string;
  baseUrl: string;
  params: Record<string, unknown>;
  people: Persona[];
}

/** Seeded PRNG (mulberry32). Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of `items` in a seeded random order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Bag = Record<string, unknown>;
const obj = (v: unknown): Bag => (v && typeof v === 'object' ? (v as Bag) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Reads a filterable value from a complete person, tolerating the few places it can live. */
export function facet(p: Persona, key: keyof Filters): string {
  const raw = p as unknown as Bag;
  switch (key) {
    case 'religion':
      return typeof raw.religion === 'string' ? raw.religion : str(obj(raw.religion).name);
    case 'industry':
      return str(obj(raw.career).industry) || str(raw.industry);
    case 'status':
      return str(obj(raw.career).status) || str(raw.status);
    case 'mbti':
      return str(raw.mbti) || str(obj(raw.personality).mbti);
    case 'relationship':
      return typeof raw.relationship === 'string' ? raw.relationship : str(obj(raw.relationship).status);
    case 'tier':
      return str(raw.tier);
    default:
      return str(raw[key]);
  }
}

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v])
    .flatMap((x) => String(x).split(','))
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export function matches(p: Persona, filters: Filters): boolean {
  const f = filters as Bag;
  if (f.minAge !== undefined && f.minAge !== null && p.age < Number(f.minAge)) return false;
  if (f.maxAge !== undefined && f.maxAge !== null && p.age > Number(f.maxAge)) return false;
  for (const key of ['gender', 'continent', 'country', 'ethnicity', 'religion', 'tier', 'mbti', 'relationship', 'industry', 'status'] as const) {
    const wanted = f[key];
    if (wanted === undefined || wanted === null || wanted === '') continue;
    if (!list(wanted).includes(facet(p, key).toLowerCase())) return false;
  }
  const q = str(f.q).trim().toLowerCase();
  if (q) {
    const hay = [p.fullName, p.city, p.country, obj(p.career).title, p.ethnicity].map(str).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function summarize(p: Persona): PersonaSummary {
  const raw = p as unknown as Bag;
  const avatar = obj(raw.avatar);
  return {
    id: p.id,
    slug: str(raw.slug),
    fullName: p.fullName,
    firstName: str(raw.firstName),
    gender: p.gender,
    age: p.age,
    city: str(raw.city),
    country: str(raw.country),
    continent: str(raw.continent),
    ethnicity: str(raw.ethnicity),
    religion: facet(p, 'religion'),
    branch: str(obj(raw.religion).branch),
    title: str(obj(raw.career).title),
    industry: facet(p, 'industry'),
    relationship: facet(p, 'relationship'),
    mbti: facet(p, 'mbti'),
    tier: facet(p, 'tier') as PersonaSummary['tier'],
    overall: Number(raw.overall ?? 0),
    tagline: str(raw.tagline),
    connections: Array.isArray(raw.connections) ? raw.connections.length : Number(raw.connections ?? 0),
    initials: str(avatar.initials),
    avatar: str(avatar.url)
  };
}

export function offlineError(what: string): Error {
  return new Error(`${what} is not available offline — the snapshot only holds people. Drop the \`snapshot\` option to use the API.`);
}

/** Answers client calls from a snapshot instead of the network. */
export class SnapshotStore {
  constructor(readonly snapshot: Snapshot) {
    if (!snapshot || !Array.isArray(snapshot.people)) throw new Error('Not a Shaqsiyad snapshot: expected { version: 1, people: [...] }');
  }

  private pick(filters: Filters, count: number, seed?: number): Persona[] {
    const pool = this.snapshot.people.filter((p) => matches(p, filters));
    return seededShuffle(pool, seed ?? Math.floor(Math.random() * 2 ** 32)).slice(0, count);
  }

  random(params: Filters & { count: number; seed?: number }): Persona[] {
    const { count, seed, ...filters } = params;
    return this.pick(filters, count, seed);
  }

  search(params: Filters & { sort?: string; page?: number; limit?: number }): SearchResult {
    const { sort, page = 1, limit = 20, ...filters } = params;
    const all = this.snapshot.people.filter((p) => matches(p, filters));
    if (sort === 'name') all.sort((a, b) => byCodePoint(a.fullName, b.fullName));
    const pages = Math.max(1, Math.ceil(all.length / limit));
    return { total: all.length, page, limit, pages, sort: sort ?? 'snapshot', matched: null, results: all.slice((page - 1) * limit, page * limit).map(summarize) };
  }

  person(idOrSlug: string, fields?: string[]): Persona | undefined {
    const p = this.snapshot.people.find((x) => x.id === idOrSlug || (x as unknown as Bag).slug === idOrSlug);
    if (!p || !fields?.length) return p;
    return Object.fromEntries(Object.entries(p).filter(([k]) => fields.includes(k) || k === 'id')) as Persona;
  }

  fixtures(shape: Shape, params: Filters & { count?: number; seed?: number }): (UserFixture | CustomerFixture)[] {
    if (shape !== 'users' && shape !== 'customers') throw offlineError(`The "${shape}" fixture shape`);
    const { count = 10, seed, ...filters } = params;
    return this.pick(filters, count, seed).map((p) => {
      const contact = obj(p.contact);
      const user: UserFixture = { id: p.id, fullName: p.fullName, email: str(contact.email) };
      return shape === 'users' ? user : { ...user, phone: str(contact.phone), address: obj(contact.address) as CustomerFixture['address'] };
    });
  }

  stats(): Record<string, unknown> {
    const count = (key: keyof Filters) => {
      const out: Record<string, number> = {};
      for (const p of this.snapshot.people) {
        const v = facet(p, key);
        if (v) out[v] = (out[v] ?? 0) + 1;
      }
      return out;
    };
    return {
      source: 'snapshot',
      createdAt: this.snapshot.createdAt,
      total: this.snapshot.people.length,
      gender: count('gender'),
      continent: count('continent'),
      country: count('country'),
      ethnicity: count('ethnicity'),
      religion: count('religion'),
      industry: count('industry')
    };
  }
}
