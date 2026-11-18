import { useEffect, useState } from 'react';

const ORIGIN = 'https://shaqsiyad.example';

type Person = { id: string; fullName: string; age: number; title: string; city: string; avatar: string };

export function PeopleList() {
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    fetch(`${ORIGIN}/api/v1/personas?limit=12&sort=shuffle`)
      .then((res) => res.json())
      .then((data) => setPeople(data.results));
  }, []);

  return (
    <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, listStyle: 'none', padding: 0 }}>
      {people.map((p) => (
        <li key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img src={`${ORIGIN}/api/v1/personas/${p.id}/avatar?size=64`} alt="" width={48} height={48} style={{ borderRadius: 24 }} />
          <div>
            <strong>{p.fullName}</strong>, {p.age}
            <div>{p.title} · {p.city}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
