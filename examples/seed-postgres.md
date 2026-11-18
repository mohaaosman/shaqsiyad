# Seed Postgres from CSV

```sh
curl "https://shaqsiyad.example/api/v1/fixtures?shape=customers&count=100&seed=4&format=csv" -o customers.csv
```

```sql
CREATE TABLE customers (
  id text PRIMARY KEY,
  "fullName" text,
  email text,
  "customerNumber" text,
  phone text,
  address jsonb,
  company text,
  "incomeBand" text,
  "customerSince" text
);

\copy customers FROM 'customers.csv' WITH (FORMAT csv, HEADER true)
```

Nested fields (like `address`) arrive as JSON text, so a `jsonb` column takes them as they are.
