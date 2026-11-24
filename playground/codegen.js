// Request building and code generation for the Shaqsiyad playground. No dependencies; runs in browsers and Node.

export const DEFAULT_BASE_URL = 'https://shaqsiyad.example/api/v1';

export const FILTERS = ['q', 'gender', 'minAge', 'maxAge', 'continent', 'country', 'ethnicity', 'religion', 'tier', 'mbti', 'relationship', 'industry', 'status'];
const NUMERIC = new Set(['minAge', 'maxAge', 'count', 'seed', 'limit', 'page', 'size']);

/** Each endpoint's path and the non-filter params it takes, in the order they're written out. */
export const ENDPOINTS = {
  random: { path: '/personas/random', params: ['count', 'seed', 'format'], filters: true },
  search: { path: '/personas', params: ['limit', 'page', 'format'], filters: true },
  fixtures: { path: '/fixtures', params: ['shape', 'count', 'seed', 'format'], filters: true },
  households: { path: '/households', params: ['count', 'seed'], filters: true },
  team: { path: '/teams', params: ['size', 'industry', 'seed'], filters: false },
  stats: { path: '/stats', params: [], filters: false }
};

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/** Turns form state into an ordered list of [key, value] pairs the endpoint accepts. */
export function params(state) {
  const ep = ENDPOINTS[state.endpoint];
  if (!ep) throw new Error(`Unknown endpoint: ${state.endpoint}`);
  const out = [];
  const add = (k) => {
    let v = state[k] ?? state.filters?.[k];
    if (blank(v)) return;
    if (k === 'format' && v === 'json') return;
    if (k === 'shape' && state.endpoint !== 'fixtures') return;
    v = NUMERIC.has(k) ? Number(v) : String(v).trim();
    if (NUMERIC.has(k) && !Number.isFinite(v)) return;
    if (!out.some(([key]) => key === k)) out.push([k, v]);
  };
  if (state.endpoint === 'fixtures') add('shape');
  if (ep.filters) for (const f of FILTERS) add(f);
  for (const p of ep.params) add(p);
  return out;
}

export function requestUrl(state) {
  const base = (blank(state.baseUrl) ? DEFAULT_BASE_URL : state.baseUrl.trim()).replace(/\/+$/, '');
  const qs = params(state)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${ENDPOINTS[state.endpoint].path}${qs ? `?${qs}` : ''}`;
}

const shellQuote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
const jsString = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const pyString = (s) => JSON.stringify(String(s));
const goString = (s) => JSON.stringify(String(s));
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const pascal = (k) => k[0].toUpperCase() + k.slice(1);
const jsKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : jsString(k));

const jsValue = (k, v) => (typeof v === 'number' ? String(v) : jsString(v));
const pyValue = (k, v) => (typeof v === 'number' ? String(v) : pyString(v));

function customBase(state) {
  return !blank(state.baseUrl) && state.baseUrl.trim().replace(/\/+$/, '') !== DEFAULT_BASE_URL ? state.baseUrl.trim().replace(/\/+$/, '') : null;
}

export function curl(state) {
  return `curl ${shellQuote(requestUrl(state))}`;
}

export function javascript(state) {
  const all = params(state);
  const format = all.find(([k]) => k === 'format')?.[1];
  const rest = all.filter(([k]) => k !== 'format' && !(state.endpoint === 'fixtures' && k === 'shape'));
  const obj = rest.length ? `{ ${rest.map(([k, v]) => `${jsKey(k)}: ${jsValue(k, v)}`).join(', ')} }` : '';
  const base = customBase(state);
  const head = [`import { Shaqsiyad } from 'shaqsiyad';`, '', `const api = new Shaqsiyad(${base ? `{ baseUrl: ${jsString(base)} }` : ''});`];
  const shape = jsString(state.shape || 'users');
  let call;
  if (format) {
    const kind = { random: 'random', search: 'personas', fixtures: 'fixtures' }[state.endpoint];
    const withShape = state.endpoint === 'fixtures' ? `{ shape: ${shape}${rest.length ? `, ${obj.slice(2, -2)}` : ''} }` : obj || '{}';
    call = `const text = await api.export('${kind}', '${format}', ${withShape});`;
  } else {
    call = {
      random: `const people = await api.random(${obj || '{ count: 5 }'});`,
      search: `const { results } = await api.search(${obj});`,
      fixtures: `const records = await api.fixtures(${shape}${obj ? `, ${obj}` : ''});`,
      households: `const households = await api.households(${obj});`,
      team: `const team = await api.team(${obj});`,
      stats: `const stats = await api.stats();`
    }[state.endpoint];
  }
  return [...head, call].join('\n');
}

export function python(state) {
  const all = params(state);
  const format = all.find(([k]) => k === 'format')?.[1];
  let rest = all.filter(([k]) => k !== 'format' && !(state.endpoint === 'fixtures' && k === 'shape'));
  const kw = (pairs) => pairs.map(([k, v]) => `${snake(k)}=${pyValue(k, v)}`);
  const base = customBase(state);
  const head = ['from shaqsiyad import Shaqsiyad', '', `api = Shaqsiyad(${base ? `base_url=${pyString(base)}` : ''})`];
  const shape = pyString(state.shape || 'users');
  let call;
  if (format) {
    const kind = { random: 'random', search: 'personas', fixtures: 'fixtures' }[state.endpoint];
    const args = [pyString(kind), pyString(format), ...(state.endpoint === 'fixtures' ? [`shape=${shape}`] : []), ...kw(rest)];
    call = `text = api.export(${args.join(', ')})`;
  } else if (state.endpoint === 'random') {
    const count = rest.find(([k]) => k === 'count')?.[1] ?? 5;
    rest = rest.filter(([k]) => k !== 'count');
    call = `people = api.random(${[String(count), ...kw(rest)].join(', ')})`;
  } else if (state.endpoint === 'search') {
    const q = rest.find(([k]) => k === 'q')?.[1];
    rest = rest.filter(([k]) => k !== 'q');
    call = `result = api.search(${[...(q !== undefined ? [pyString(q)] : []), ...kw(rest)].join(', ')})`;
  } else if (state.endpoint === 'fixtures') {
    call = `records = api.fixtures(${[shape, ...kw(rest)].join(', ')})`;
  } else {
    call = `${{ households: 'households', team: 'team', stats: 'stats' }[state.endpoint]} = api.${state.endpoint}(${kw(rest).join(', ')})`;
  }
  return [...head, call].join('\n');
}

export function cli(state) {
  const all = params(state);
  const parts = ['npx', 'shaqsiyad', state.endpoint];
  if (state.endpoint === 'fixtures') parts.push(state.shape || 'users');
  for (const [k, v] of all) {
    if (k === 'shape') continue;
    if (state.endpoint === 'search' && k === 'q') parts.splice(3, 0, shellQuote(v));
    else parts.push(`--${k}`, shellQuote(String(v)));
  }
  const base = customBase(state);
  if (base) parts.push('--base-url', shellQuote(base));
  return parts.join(' ');
}

export function go(state) {
  const all = params(state).filter(([k]) => k !== 'format');
  const type = { random: 'RandomParams', search: 'SearchParams', fixtures: 'FixturesParams', households: 'HouseholdsParams', team: 'TeamParams' }[state.endpoint];
  const method = { random: 'Random', search: 'Search', fixtures: 'Fixtures', households: 'Households', team: 'Team', stats: 'Stats' }[state.endpoint];
  const fields = all.map(([k, v]) => `${k === 'q' ? 'Q' : pascal(k)}: ${typeof v === 'number' ? v : goString(v)}`);
  const base = customBase(state);
  const lines = [
    'import shaqsiyad "github.com/mohaaosman/shaqsiyad/packages/go"',
    '',
    `client := shaqsiyad.New(${base ? `shaqsiyad.WithBaseURL(${goString(base)})` : ''})`,
    type ? `result, err := client.${method}(ctx, shaqsiyad.${type}{${fields.join(', ')}})` : `result, err := client.${method}(ctx)`
  ];
  return lines.join('\n');
}

/** Every snippet for the current form state. */
export function snippets(state) {
  return { curl: curl(state), javascript: javascript(state), python: python(state), cli: cli(state), go: go(state) };
}
