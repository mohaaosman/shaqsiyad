// Pure logic for the plugin: no `figma` globals, so it can be unit-tested in Node.
// Note: the Figma sandbox has no URLSearchParams, so queries are built by hand.

export const MAX_PER_REQUEST = 50;

export interface Person {
  id?: string;
  fullName: string;
  firstName: string;
  lastName?: string;
  age: number;
  city: string;
  country: string;
  tagline: string;
  bio?: unknown;
  ethnicity: string;
  religion: { name: string; branch?: string };
  career: { title: string; company?: string | null };
  contact: { email: string; phone?: string };
  avatar: { initials?: string; sizes: { png: string } };
}

export interface FillRequest {
  type: 'fill';
  gender?: string;
  continent?: string;
  minAge?: string;
  maxAge?: string;
  seed?: string;
  variables?: boolean;
}

export type Filters = Record<string, string>;

/** Filters a layer name may carry, e.g. `Card [gender=female, country=Kenya]`. Keys are matched case-insensitively. */
export const FILTER_KEYS = ['q', 'gender', 'minAge', 'maxAge', 'continent', 'country', 'ethnicity', 'religion', 'tier', 'mbti', 'relationship', 'industry', 'status'];
const CANONICAL = new Map(FILTER_KEYS.map((k) => [k.toLowerCase(), k]));

export function parseFrameFilters(name: string): Filters {
  const match = /\[([^\]]*)\]\s*$/.exec(name);
  const filters: Filters = {};
  if (!match) return filters;
  for (const part of match[1].split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = CANONICAL.get(part.slice(0, eq).trim().toLowerCase());
    const value = part.slice(eq + 1).trim();
    if (key && value) filters[key] = value;
  }
  return filters;
}

export function baseFilters(request: FillRequest): Filters {
  const filters: Filters = {};
  for (const key of ['gender', 'continent', 'minAge', 'maxAge'] as const) {
    const value = request[key]?.trim();
    if (value) filters[key] = value;
  }
  return filters;
}

export function buildQuery(filters: Filters, count: number, seed?: number): string {
  const pairs = [`count=${count}`];
  if (seed !== undefined) pairs.push(`seed=${seed}`);
  for (const key of Object.keys(filters).sort()) pairs.push(`${key}=${encodeURIComponent(filters[key])}`);
  return pairs.join('&');
}

/** Split `count` people into requests of at most 50. Each chunk gets seed, seed+1, … so the whole set stays repeatable. */
export function chunkRequests(count: number, seed?: number): { count: number; seed?: number }[] {
  const chunks: { count: number; seed?: number }[] = [];
  for (let i = 0, left = count; left > 0; i++, left -= MAX_PER_REQUEST) {
    chunks.push({ count: Math.min(left, MAX_PER_REQUEST), seed: seed === undefined ? undefined : seed + i });
  }
  return chunks;
}

export function parseSeed(seed?: string): number | undefined {
  if (seed === undefined || seed.trim() === '') return undefined;
  const n = Number(seed);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export interface NodeLike {
  name: string;
  children?: readonly NodeLike[];
}

/**
 * Which nodes get one person each. A single selected frame whose direct children (2+) all share a name
 * is treated as a repeat grid: each child is a person, and the frame's own `[filters]` apply to all of them.
 */
export function planTargets<T extends NodeLike>(selection: readonly T[]): { node: T; inherited: Filters }[] {
  if (selection.length === 1) {
    const parent = selection[0];
    const kids = parent.children ?? [];
    if (kids.length >= 2 && kids.every((k) => k.name === kids[0].name)) {
      const inherited = parseFrameFilters(parent.name);
      return kids.map((node) => ({ node: node as T, inherited }));
    }
  }
  return selection.map((node) => ({ node, inherited: {} }));
}

/** Group targets by their effective filters (UI < parent frame < own name) so each group is one request. */
export function groupTargets<T extends NodeLike>(targets: { node: T; inherited: Filters }[], base: Filters): { filters: Filters; nodes: T[] }[] {
  const groups = new Map<string, { filters: Filters; nodes: T[] }>();
  for (const { node, inherited } of targets) {
    const filters = { ...base, ...inherited, ...parseFrameFilters(node.name) };
    const key = buildQuery(filters, 0);
    const group = groups.get(key) ?? { filters, nodes: [] };
    group.nodes.push(node);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function textFor(p: Person): Record<string, string> {
  const last = p.lastName ?? p.fullName.split(' ').slice(1).join(' ');
  const initials = p.avatar.initials ?? p.fullName.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  return {
    '#name': p.fullName,
    '#first': p.firstName,
    '#last': last,
    '#initials': initials,
    '#age': String(p.age),
    '#job': p.career.title,
    '#title': p.career.title,
    '#company': p.career.company ?? '',
    '#city': p.city,
    '#country': p.country,
    '#email': p.contact.email,
    '#phone': p.contact.phone ?? '',
    '#tagline': p.tagline,
    '#bio': typeof p.bio === 'string' && p.bio ? p.bio : p.tagline,
    '#ethnicity': p.ethnicity,
    '#religion': p.religion.name
  };
}

/** Layer names are matched without their `[filters]` suffix, so `#name [gender=male]` still gets the name. */
export function layerKey(name: string): string {
  return name.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

// ---- Component properties and variables -------------------------------------------------------

/** Field keys a component property or variable may be named after (the layer keys without `#`). */
export const FIELD_KEYS = ['name', 'first', 'last', 'initials', 'age', 'job', 'title', 'company', 'city', 'country', 'email', 'phone', 'tagline', 'bio', 'ethnicity', 'religion'];

/** `Name#12:3` → `name`; `Person/Job` → `job`. Returns null when it isn't one of FIELD_KEYS. */
export function fieldKey(name: string): string | null {
  const bare = name.split('#')[0].split('/').pop()!.trim().toLowerCase();
  return FIELD_KEYS.includes(bare) ? bare : null;
}

/** Values for an instance's TEXT component properties whose names match a field: `{ 'name#12:3': 'Amina Farah' }`. */
export function componentPropertyValues(properties: Record<string, { type: string }>, person: Person): Record<string, string> {
  const texts = textFor(person);
  const values: Record<string, string> = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type !== 'TEXT') continue;
    const field = fieldKey(key);
    if (field) values[key] = texts[`#${field}`];
  }
  return values;
}

export interface VariableLike {
  id: string;
  name: string;
  resolvedType: string;
}

/** STRING variables named after a field, with the value each should take for this person. */
export function variableValues(variables: readonly VariableLike[], person: Person): { id: string; value: string }[] {
  const texts = textFor(person);
  const out: { id: string; value: string }[] = [];
  for (const v of variables) {
    if (v.resolvedType !== 'STRING') continue;
    const field = fieldKey(v.name);
    if (field) out.push({ id: v.id, value: texts[`#${field}`] });
  }
  return out;
}

export const COLLECTION_NAME = 'shaqsiyad';

export function isShaqsiyadCollection(name: string): boolean {
  return name.trim().toLowerCase() === COLLECTION_NAME;
}

export type ModeAction = { kind: 'reuse'; modeId: string; name: string } | { kind: 'add'; name: string };

/**
 * One mode per person: reuse the collection's existing modes in order (renamed to the person),
 * then add the rest. Names are made unique (`Amina`, `Amina 2`).
 */
export function planModes(existing: readonly { modeId: string; name: string }[], firstNames: readonly string[]): ModeAction[] {
  const seen = new Map<string, number>();
  return firstNames.map((first, i) => {
    const base = first.trim() || `Person ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const name = n === 1 ? base : `${base} ${n}`;
    return i < existing.length ? { kind: 'reuse', modeId: existing[i].modeId, name } : { kind: 'add', name };
  });
}
