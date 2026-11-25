# Seeder recipes

Every recipe pulls seeded records from `/fixtures`, so re-running gives the same people, and upserts by email, so re-running never duplicates them.

| Stack | File | Shape |
|---|---|---|
| Prisma | [`seed-prisma.ts`](seed-prisma.ts) | `users` |
| Drizzle (Postgres) | [`seed-drizzle.ts`](seed-drizzle.ts) | `customers` |
| Django | [`seed-django.py`](seed-django.py) | `users` → `auth.User` |
| Rails | [`seed-rails.rb`](seed-rails.rb) | `customers` |
| Supabase | [`seed-supabase.ts`](seed-supabase.ts) | `customers` |
| Laravel | [`laravel-seeder.php`](laravel-seeder.php) | `users` |
| Postgres `\copy` | [`seed-postgres.md`](seed-postgres.md) | `customers` (CSV) |

Fields used — `users`: `id`, `fullName`, `email`. `customers`: those plus `customerNumber`, `phone`, `address` (object), `company` (may be null), `incomeBand`, `customerSince`.

Change `count` (1–100) and `seed` to get a different, equally repeatable cast.
