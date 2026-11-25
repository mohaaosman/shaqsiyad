// Seed a Supabase `customers` table with fictional people.
// Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx seed-supabase.ts
//
// create table customers (
//   id text primary key, full_name text, email text unique not null, customer_number text,
//   phone text, address jsonb, company text, income_band text, customer_since text
// );
import { createClient } from '@supabase/supabase-js';

type CustomerFixture = {
  id: string; fullName: string; email: string; customerNumber: string; phone: string;
  address: Record<string, string>; company: string | null; incomeBand: string; customerSince: string;
};

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const res = await fetch('https://shaqsiyad.example/api/v1/fixtures?shape=customers&count=100&seed=4');
if (!res.ok) throw new Error(`Shaqsiyad: ${res.status}`);
const people = (await res.json()) as CustomerFixture[];

const { error } = await supabase.from('customers').upsert(
  people.map((p) => ({
    id: p.id,
    full_name: p.fullName,
    email: p.email,
    customer_number: p.customerNumber,
    phone: p.phone,
    address: p.address,
    company: p.company,
    income_band: p.incomeBand,
    customer_since: p.customerSince
  })),
  { onConflict: 'email' }
);
if (error) throw error;
console.log(`Seeded ${people.length} customers`);
