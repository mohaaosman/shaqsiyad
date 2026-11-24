# shaqsiyad-react

React hooks and an `<Avatar>` for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Fill prototypes and demos with fictional people who have whole lives.

```sh
pnpm add shaqsiyad shaqsiyad-react
```

```tsx
import { ShaqsiyadProvider, usePeople, Avatar } from 'shaqsiyad-react';

function Team() {
  const { data, loading, error, refetch } = usePeople({ count: 6, seed: 1, industry: 'Healthcare' });
  if (loading) return <p>Loading…</p>;
  if (error) return <button onClick={refetch}>Retry ({error.message})</button>;
  return (
    <ul>
      {data!.map((p) => (
        <li key={p.id}>
          <Avatar person={{ fullName: p.fullName, avatar: p.avatar }} size={40} /> {p.fullName} · {p.career.title}
        </li>
      ))}
    </ul>
  );
}

export const App = () => (
  <ShaqsiyadProvider baseUrl="https://shaqsiyad.example/api/v1">
    <Team />
  </ShaqsiyadProvider>
);
```

## Hooks

| Hook | Returns |
|---|---|
| `usePeople({ count, seed, ...filters })` | Random complete people |
| `useSearch({ q, page, limit, ...filters })` | A page of summaries |
| `usePerson(id, { fields })` | One person (`null` id skips the fetch) |
| `useFixtures(shape, { count, seed, ...filters })` | `users`, `customers`, `employees` or `patients` records |
| `useShaqsiyad()` | The shared client, for anything else |

Each returns `{ data, error, loading, refetch }`.

- **Cached.** Responses are cached per provider by request URL, so the same seeded query renders instantly everywhere. `refetch()` drops the cache entry.
- **No stale flashes.** If params change while a request is in flight, the old response is ignored.
- **Provider optional.** Without `<ShaqsiyadProvider>` a default client is used. Pass `client={new Shaqsiyad({...})}` for timeouts, retries or a custom fetch.

## `<Avatar person size>`

An `<img>` with `alt` set to the person's name; if the image fails it shows their initials instead. Accepts a summary (`avatar` is a URL) or a full persona (`avatar.url`). Any other `img` props pass through.

## Develop

```sh
(cd ../js && pnpm install && pnpm build)
pnpm install && pnpm test
```
