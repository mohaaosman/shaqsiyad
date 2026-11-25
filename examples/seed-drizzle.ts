// Seed a Drizzle (Postgres) `customers` table with 100 fictional customers.
// Run: npx tsx db/seed.ts   (needs DATABASE_URL)
import { drizzle } from 'drizzle-orm/node-postgres';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  customerNumber: text('customer_number'),
  phone: text('phone'),
  address: jsonb('address'),
  company: text('company'),
  incomeBand: text('income_band'),
  customerSince: text('customer_since')
});

type CustomerFixture = typeof customers.$inferInsert;

const db = drizzle(process.env.DATABASE_URL!);
const res = await fetch('https://shaqsiyad.example/api/v1/fixtures?shape=customers&count=100&seed=4');
if (!res.ok) throw new Error(`Shaqsiyad: ${res.status}`);
const rows = (await res.json()) as CustomerFixture[];

for (const row of rows) {
  const { id, email, ...rest } = row;
  await db.insert(customers).values(row).onConflictDoUpdate({ target: customers.email, set: rest });
}
console.log(`Seeded ${rows.length} customers`);
process.exit(0);
