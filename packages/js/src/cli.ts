import { writeFile } from 'node:fs/promises';
import { pullSnapshot, Shaqsiyad, ShaqsiyadError, type Query, type Shape } from './index.js';

export { ShaqsiyadError };

const HELP = `shaqsiyad — fictional people with whole lives

Usage
  shaqsiyad random [--count 5] [--seed 1] [filters]
  shaqsiyad search [text] [--limit 20] [--page 1] [--all] [filters]
  shaqsiyad person <id|slug> [--fields fullName,career]
  shaqsiyad graph <id|slug> [--depth 1|2]
  shaqsiyad fixtures <users|customers|employees|patients> [--count 10] [--seed 1] [--format csv|ndjson]
  shaqsiyad households [--count 3] [--seed 1] [filters]
  shaqsiyad team [--size 6] [--industry Healthcare] [--seed 1]
  shaqsiyad stats
  shaqsiyad avatar <id|slug> [--size 64|128|256|512] [--format webp|png]
  shaqsiyad sheet [--count 12] [--seed 1] [filters]
  shaqsiyad pull [--count 100] [--seed 1] [--out people.json] [filters]

Filters
  --gender male|female  --minAge 20  --maxAge 75  --continent Africa  --country Kenya
  --ethnicity Somali  --religion Muslim  --tier warm  --mbti INFJ
  --relationship Married  --industry Healthcare  --status Employed

Options
  --base-url <url>   API root (or set SHAQSIYAD_BASE_URL)
  --snapshot <file>  Answer from a file written by \`pull\` instead of the network
  --compact          One-line JSON
  -h, --help         This help
`;

const FORMATS = new Set(['csv', 'ndjson']);
const SHAPES = new Set<Shape>(['users', 'customers', 'employees', 'patients']);

export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') flags.help = true;
    else if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      const next = argv[i + 1];
      if (inline !== undefined) flags[key] = inline;
      else if (next !== undefined && (!next.startsWith('-') || /^-\d/.test(next))) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(arg);
  }
  return { positional, flags };
}

export function fail(message: string): never {
  process.stderr.write(`shaqsiyad: ${message}\n`);
  process.exit(1);
}

export async function run(argv: string[], out: (text: string) => void = (t) => process.stdout.write(t)): Promise<void> {
  const { positional, flags } = parseArgs(argv);
  const [command, arg] = positional;
  if (!command || flags.help) return out(HELP);

  const baseUrl = typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined;
  const compact = flags.compact === true;
  const format = typeof flags.format === 'string' ? flags.format : undefined;
  const query: Query = {};
  for (const [key, value] of Object.entries(flags)) {
    if (['base-url', 'snapshot', 'out', 'compact', 'help', 'all', 'format'].includes(key)) continue;
    query[key] = value === true ? 'true' : value;
  }
  const snapshot = typeof flags.snapshot === 'string' ? flags.snapshot : undefined;
  const api = new Shaqsiyad({ baseUrl, snapshot });
  const print = (data: unknown) => out(`${JSON.stringify(data, null, compact ? 0 : 2)}\n`);
  const need = (what: string) => arg ?? fail(`${command} needs ${what}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asNumbers = (q: Query): any => {
    for (const k of ['count', 'seed', 'minAge', 'maxAge', 'limit', 'page', 'size', 'depth']) if (q[k] !== undefined) q[k] = Number(q[k]);
    return q;
  };

  switch (command) {
    case 'random':
      if (format && FORMATS.has(format)) return out(await api.export('random', format as 'csv', asNumbers({ count: 5, ...query })));
      return print(await api.random(asNumbers({ count: 5, ...query })));
    case 'search': {
      const params = asNumbers({ q: arg, ...query });
      if (format && FORMATS.has(format)) return out(await api.export('personas', format as 'csv', params));
      if (flags.all) {
        for await (const person of api.searchAll(params)) out(`${JSON.stringify(person)}\n`);
        return;
      }
      return print(await api.search(params));
    }
    case 'person':
      return print(await api.person(need('an id or slug'), { fields: typeof query.fields === 'string' ? query.fields.split(',') : undefined }));
    case 'graph':
      return print(await api.graph(need('an id or slug'), Number(query.depth ?? 1) === 2 ? 2 : 1));
    case 'fixtures': {
      const shape = need('a shape: users, customers, employees or patients') as Shape;
      if (!SHAPES.has(shape)) fail(`unknown shape "${shape}"`);
      if (format && FORMATS.has(format)) return out(await api.export('fixtures', format as 'csv', { ...asNumbers(query), shape }));
      return print(await api.fixtures(shape, asNumbers(query)));
    }
    case 'households':
      return print(await api.households(asNumbers(query)));
    case 'team':
      return print(await api.team(asNumbers(query)));
    case 'stats':
      return print(await api.stats());
    case 'avatar':
      return out(`${api.avatarUrl(need('an id or slug'), { size: query.size ? (Number(query.size) as 64) : undefined, format: format as 'png' | undefined })}\n`);
    case 'sheet':
      return out(`${api.sheetUrl(asNumbers(query))}\n`);
    case 'pull': {
      const snap = await pullSnapshot(api, asNumbers({ count: 100, seed: 1, ...query }));
      const json = `${JSON.stringify(snap, null, compact ? 0 : 2)}\n`;
      if (typeof flags.out === 'string') {
        await writeFile(flags.out, json);
        return out(`Saved ${snap.people.length} people to ${flags.out}\n`);
      }
      return out(json);
    }
    default:
      fail(`unknown command "${command}" (try --help)`);
  }
}
