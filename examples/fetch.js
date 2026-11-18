const BASE = 'https://shaqsiyad.example/api/v1';

const res = await fetch(`${BASE}/personas/random?count=5&continent=Asia&seed=11`);
const people = await res.json();

for (const p of people) console.log(`${p.fullName}, ${p.age} · ${p.career.title} in ${p.city} · ${p.religion.name}`);
