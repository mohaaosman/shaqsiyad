import { pullSnapshot, Shaqsiyad, type ClientOptions, type Filters, type Persona } from './index.js';
import type { Snapshot } from './snapshot.js';

export interface FakerOptions extends Filters, Pick<ClientOptions, 'baseUrl' | 'fetch' | 'timeout' | 'retries'> {
  /** Same seed + same filters → same people in the same order. Defaults to 1. */
  seed?: number;
  /** How many people to preload. The faker cycles through them. Defaults to 100. */
  count?: number;
  /** Load from a snapshot (file path or object) instead of the network. */
  snapshot?: string | Snapshot;
}

/**
 * A Faker-style facade over seeded Shaqsiyad people.
 *
 * Every helper reads the *current* person, so `fullName()`, `email()` and `avatar()` all describe
 * the same human. Call `next()` to move on to the next person (it wraps around after the last one).
 */
export interface ShaqsiyadFaker {
  /** The person the helpers are describing right now. */
  current(): Persona;
  /** Advance to the next person and return them. */
  next(): Persona;
  /** Every preloaded person. */
  readonly people: readonly Persona[];
  person: { fullName(): string; firstName(): string; lastName(): string; sex(): 'male' | 'female'; jobTitle(): string };
  internet: { email(): string };
  phone: { number(): string };
  location: { city(): string; country(): string; streetAddress(): string };
  image: { avatar(): string };
}

/** Wrap an already-loaded list of people. */
export function fakerFrom(people: readonly Persona[], api: Shaqsiyad = new Shaqsiyad()): ShaqsiyadFaker {
  if (!people.length) throw new Error('No people matched — loosen the filters or use a bigger snapshot.');
  let index = 0;
  const p = () => people[index];
  const lastName = () => {
    const raw = p() as Persona & { lastName?: string };
    return raw.lastName || p().fullName.split(' ').slice(1).join(' ');
  };
  return {
    people,
    current: p,
    next() {
      index = (index + 1) % people.length;
      return p();
    },
    person: {
      fullName: () => p().fullName,
      firstName: () => (p() as Persona & { firstName?: string }).firstName || p().fullName.split(' ')[0],
      lastName,
      sex: () => p().gender,
      jobTitle: () => p().career?.title ?? ''
    },
    internet: { email: () => p().contact?.email ?? '' },
    phone: { number: () => p().contact?.phone ?? '' },
    location: {
      city: () => p().city,
      country: () => p().country,
      streetAddress: () => p().contact?.address?.street ?? ''
    },
    image: {
      avatar: () => {
        const url = p().avatar?.url;
        if (!url) return api.avatarUrl(p().id);
        return /^https?:/.test(url) ? url : new URL(url, api.baseUrl).href;
      }
    }
  };
}

/** Preload seeded people, then hand back a synchronous Faker-style object. */
export async function createFaker(options: FakerOptions = {}): Promise<ShaqsiyadFaker> {
  const { seed = 1, count = 100, snapshot, baseUrl, fetch, timeout, retries, ...filters } = options;
  const api = new Shaqsiyad({ baseUrl, fetch, timeout, retries, snapshot });
  const people = api.offline ? await api.random({ ...filters, count, seed }) : (await pullSnapshot(api, { ...filters, count, seed })).people;
  return fakerFrom(people, api);
}
