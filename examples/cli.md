# CLI

Both SDKs ship the same `shaqsiyad` command.

```sh
npx shaqsiyad random --count 3 --seed 1 --country Somalia     # Node
pipx run shaqsiyad random --count 3 --seed 1 --country Somalia # Python
```

```sh
# 100 seeded users straight into Postgres
npx shaqsiyad fixtures users --count 100 --seed 1 --format csv \
  | psql "$DATABASE_URL" -c "\copy users FROM STDIN WITH CSV HEADER"

# Every Hindu person in the dataset, one JSON object per line
npx shaqsiyad search --religion Hindu --all > hindus.ndjson

# Names only, with jq
npx shaqsiyad random --count 10 --seed 4 --compact | jq -r '.[].fullName'

# A team of six for an org-chart mockup
npx shaqsiyad team --size 6 --industry Healthcare --seed 3
```
