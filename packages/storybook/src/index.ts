import { Shaqsiyad, type Filters, type Persona, type Shape } from 'shaqsiyad';

/** The client methods used here. A `Shaqsiyad` instance fits; so does a fake in tests. */
export type Client = Pick<Shaqsiyad, 'random' | 'fixtures'>;

/** What a story puts in `parameters.shaqsiyad`. */
export interface PeopleParameters {
  /** How many people. Defaults to 5. */
  count?: number;
  /** Same seed → same people in every render, screenshot and CI run. Defaults to 1. */
  seed?: number;
  filters?: Filters;
  /** Load app-shaped fixture records instead of full people. */
  shape?: Shape;
  /** Set to `false` to switch loading off for one story. */
  disable?: boolean;
}

/** The parts of a Storybook context these helpers read and write. */
export interface StoryContext {
  parameters?: Record<string, unknown> & { shaqsiyad?: PeopleParameters };
  loaded?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Options {
  client?: Client;
  baseUrl?: string;
}

let shared: Client | undefined;
const clientFor = (options: Options): Client => options.client ?? (options.baseUrl ? new Shaqsiyad({ baseUrl: options.baseUrl }) : (shared ??= new Shaqsiyad()));

const cache = new Map<string, Promise<unknown>>();

function load(client: Client, p: PeopleParameters): Promise<Persona[] | Record<string, unknown>[]> {
  const count = p.count ?? 5;
  const seed = p.seed ?? 1;
  const key = JSON.stringify([p.shape ?? 'people', count, seed, p.filters ?? {}]);
  // Only the default client's responses are cached: a custom client may point anywhere.
  const cacheable = client === shared;
  if (cacheable && cache.has(key)) return cache.get(key) as Promise<Persona[]>;
  const promise = p.shape ? client.fixtures(p.shape, { ...p.filters, count, seed }) : client.random({ ...p.filters, count, seed });
  if (cacheable) {
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}

/**
 * A Storybook loader with fixed parameters.
 *
 * ```ts
 * export const Default = { loaders: [shaqsiyadLoader({ count: 3, seed: 7, country: 'Kenya' })] };
 * // render: (args, { loaded: { people } }) => <List people={people} />
 * ```
 */
export function shaqsiyadLoader(params: Filters & { count?: number; seed?: number; shape?: Shape } = {}, options: Options = {}) {
  const { count, seed, shape, ...filters } = params;
  return async (_context?: StoryContext): Promise<{ people: Persona[] | Record<string, unknown>[] }> => ({
    people: await load(clientFor(options), { count, seed, shape, filters })
  });
}

/**
 * A loader that reads `parameters.shaqsiyad`, so it can be set once in `.storybook/preview`
 * and tuned per story. Stories without the parameter get nothing loaded.
 */
export function peopleLoader(options: Options = {}) {
  return async (context: StoryContext): Promise<{ people?: Persona[] | Record<string, unknown>[] }> => {
    const p = context.parameters?.shaqsiyad;
    if (!p || p.disable) return {};
    return { people: await load(clientFor(options), p) };
  };
}

/**
 * A decorator that makes `context.loaded.people` available even where loaders can't run
 * (for example in older test runners). Prefer `peopleLoader` in `.storybook/preview`.
 * Until the people arrive it renders the story with an empty list, then calls `onLoad` so
 * your framework can re-render.
 */
export function withPeople<S>(options: Options & { onLoad?: () => void } = {}) {
  const resolved = new Map<string, unknown>();
  return (story: (context?: StoryContext) => S, context: StoryContext): S => {
    const p = context.parameters?.shaqsiyad;
    if (!p || p.disable) return story(context);
    const key = JSON.stringify(p);
    context.loaded = context.loaded ?? {};
    if (context.loaded.people === undefined) {
      if (resolved.has(key)) context.loaded.people = resolved.get(key);
      else {
        context.loaded.people = [];
        load(clientFor(options), p).then(
          (people) => {
            resolved.set(key, people);
            options.onLoad?.();
          },
          (error: unknown) => console.warn('shaqsiyad-storybook: could not load people', error)
        );
      }
    }
    return story(context);
  };
}

/** For tests: forget everything cached by the shared client. */
export function clearCache(): void {
  cache.clear();
}
