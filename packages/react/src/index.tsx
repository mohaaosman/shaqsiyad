import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { Shaqsiyad, type Filters, type Persona, type PersonaSummary, type SearchResult, type Shape } from 'shaqsiyad';

/** The client methods the hooks use. A `Shaqsiyad` instance fits; so does a fake in tests. */
export type Client = Pick<Shaqsiyad, 'url' | 'random' | 'search' | 'person' | 'fixtures'>;

interface ContextValue {
  client: Client;
  cache: Map<string, Promise<unknown>>;
}

const Context = createContext<ContextValue | null>(null);
let fallback: ContextValue | null = null;

export interface ProviderProps {
  /** A ready client. Wins over `baseUrl`. */
  client?: Client;
  /** API root for a client made for you. */
  baseUrl?: string;
  children?: ReactNode;
}

/** Shares one client and one response cache with every hook below it. */
export function ShaqsiyadProvider({ client, baseUrl, children }: ProviderProps) {
  const value = useMemo<ContextValue>(() => ({ client: client ?? new Shaqsiyad({ baseUrl }), cache: new Map() }), [client, baseUrl]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function useShaqsiyadContext(): ContextValue {
  const ctx = useContext(Context);
  if (ctx) return ctx;
  return (fallback ??= { client: new Shaqsiyad(), cache: new Map() });
}

/** The client from the nearest provider (or a default one). */
export function useShaqsiyad(): Client {
  return useShaqsiyadContext().client;
}

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Drop the cached response and fetch again. */
  refetch: () => void;
}

/**
 * Fetches once per distinct `key` (the request URL). Identical keys share a cached promise,
 * and a result that arrives after the key has changed is ignored.
 */
export function useQuery<T>(key: string | null, load: (client: Client) => Promise<T>): QueryState<T> {
  const { client, cache } = useShaqsiyadContext();
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error; loading: boolean }>({ key, loading: key !== null });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) {
      setState({ key, loading: false });
      return;
    }
    let current = true;
    let promise = cache.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = loadRef.current(client);
      cache.set(key, promise);
      promise.catch(() => cache.delete(key));
    }
    setState((s) => ({ key, data: s.key === key ? s.data : undefined, loading: true }));
    promise.then(
      (data) => current && setState({ key, data, loading: false }),
      (error: unknown) => current && setState({ key, error: error instanceof Error ? error : new Error(String(error)), loading: false })
    );
    return () => {
      current = false;
    };
  }, [key, nonce, client, cache]);

  const refetch = useCallback(() => {
    if (key !== null) cache.delete(key);
    setNonce((n) => n + 1);
  }, [key, cache]);

  const fresh = state.key === key;
  return { data: fresh ? state.data : undefined, error: fresh ? state.error : undefined, loading: fresh ? state.loading : key !== null, refetch };
}


/** Random complete people. Pass a `seed` to get the same people on every render and reload. */
export function usePeople(params: Filters & { count: number; seed?: number }): QueryState<Persona[]> {
  const client = useShaqsiyad();
  const key = client.url('/personas/random', { ...params });
  return useQuery(key, (c) => c.random(params));
}

/** A page of search results. */
export function useSearch(params: Filters & { sort?: string; page?: number; limit?: number }): QueryState<SearchResult> {
  const client = useShaqsiyad();
  const key = client.url('/personas', { ...params });
  return useQuery(key, (c) => c.search(params));
}

/** One complete person. Pass `null` as the id to skip fetching. */
export function usePerson(idOrSlug: string | null | undefined, options: { fields?: string[] } = {}): QueryState<Persona> {
  const client = useShaqsiyad();
  const fields = options.fields?.join(',');
  const key = idOrSlug ? client.url(`/personas/${encodeURIComponent(idOrSlug)}`, { fields }) : null;
  return useQuery(key, (c) => c.person(idOrSlug as string, { fields: options.fields }));
}

/** Records shaped for an app: users, customers, employees or patients. */
export function useFixtures(shape: Shape, params: Filters & { count?: number; seed?: number } = {}): QueryState<Record<string, unknown>[]> {
  const client = useShaqsiyad();
  const key = client.url('/fixtures', { shape, ...params });
  return useQuery(key, (c) => c.fixtures(shape, params));
}

type AvatarPerson = Pick<PersonaSummary, 'fullName'> & { avatar: string | { url: string; initials?: string }; initials?: string };

export interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  person: AvatarPerson;
  /** Pixel size; also used for the initials fallback. Defaults to 64. */
  size?: number;
}

const initialsOf = (p: AvatarPerson) =>
  p.initials ??
  (typeof p.avatar === 'object' ? p.avatar.initials : undefined) ??
  p.fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** A round portrait that falls back to initials if the image can't load. */
export function Avatar({ person, size = 64, style, ...rest }: AvatarProps) {
  const src = typeof person.avatar === 'string' ? person.avatar : person.avatar.url;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const base = { width: size, height: size, borderRadius: '50%', ...style };
  if (failed || !src) {
    return (
      <span role="img" aria-label={person.fullName} style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#e5e1da', color: '#3b3a36', fontSize: size * 0.4, fontWeight: 600, fontFamily: 'system-ui, sans-serif' }}>
        {initialsOf(person)}
      </span>
    );
  }
  return <img {...rest} src={src} alt={person.fullName} width={size} height={size} style={{ objectFit: 'cover', ...base }} onError={() => setFailed(true)} />;
}
