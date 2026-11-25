// Seed a Prisma `User` model with 50 fictional people.
// Run: npx tsx prisma/seed.ts   (or add "prisma": { "seed": "tsx prisma/seed.ts" } to package.json and run `npx prisma db seed`)
//
// model User {
//   id           String @id
//   name         String
//   email        String @unique
// }
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = 'https://shaqsiyad.example/api/v1';

type UserFixture = { id: string; fullName: string; email: string };

async function main() {
  const res = await fetch(`${API}/fixtures?shape=users&count=50&seed=1`);
  if (!res.ok) throw new Error(`Shaqsiyad: ${res.status}`);
  const users = (await res.json()) as UserFixture[];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.fullName },
      create: { id: u.id, name: u.fullName, email: u.email }
    });
  }
  console.log(`Seeded ${users.length} users`);
}

main().finally(() => prisma.$disconnect());
