# shaqsiyad

Python client and CLI for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Standard library only, Python 3.9+.

```sh
pip install shaqsiyad
```

```python
from shaqsiyad import Shaqsiyad

api = Shaqsiyad()
nurses = api.search("nurse", continent="Africa", limit=10)
cast = api.random(8, min_age=25, max_age=40, seed=7)       # snake_case or camelCase
amina = api.person(cast[0]["id"], fields=["fullName", "career"])
employees = api.fixtures("employees", count=100, seed=2)  # see EmployeeFixture
csv_text = api.export("fixtures", "csv", shape="users", count=50, seed=1)

for person in api.search_all(religion="Muslim", country="Kenya", max=500):
    print(person["fullName"])
```

Same `seed` + same filters → same people.

`Shaqsiyad(base_url=..., timeout=30.0, retries=1)` — or set `SHAQSIYAD_BASE_URL`. Errors raise `ShaqsiyadError` with `.status` (0 for network errors and timeouts). A `429` or `5xx` is retried after `retry-after`.

## Fixture types

`UserFixture`, `CustomerFixture`, `EmployeeFixture` and `PatientFixture` are `TypedDict`s for the records `fixtures()` returns. Every record has `id`, `fullName` and `email`; customers add `customerNumber`, `phone`, `address`, `company`, `incomeBand` and `customerSince`. Records can carry more keys than are typed so far.

## Offline snapshots

```sh
shaqsiyad pull --count 500 --seed 1 --country Kenya --out people.json
```

```python
api = Shaqsiyad(snapshot="people.json")     # or a dict
api.random(5, seed=3, religion="Muslim")    # same seed → same picks as the JS SDK, no network
```

Offline, `random`, `search`, `search_all`, `person`, `fixtures` (users, customers) and `stats` come from the file. `graph`, `households`, `team`, `export` and the other fixture shapes need the API and raise a clear `ShaqsiyadError`. `pull_snapshot(api, count, seed, **filters)` does what `pull` does.

## Faker-style helpers

```python
from shaqsiyad.faker import create_faker

fake = create_faker(seed=1, count=100, country="Somalia")  # or snapshot="people.json"
fake.person.full_name(), fake.internet.email(), fake.image.avatar()  # all the same person
fake.next()                                                          # the next one
```

Helpers read the *current* person; `next()` advances and wraps around. Available: `person.full_name/first_name/last_name/sex/job_title`, `internet.email`, `phone.number`, `location.city/country/street_address`, `image.avatar`, plus `current()` and `people`.

## CLI

```sh
shaqsiyad random --count 3 --seed 1 --country Somalia
shaqsiyad search "nurse who loves jazz" --limit 5
shaqsiyad fixtures users --count 100 --seed 1 --format csv > users.csv
shaqsiyad team --size 6 --industry Healthcare
shaqsiyad pull --count 200 --seed 1 --out people.json
shaqsiyad --snapshot people.json random --count 3    # offline
python -m shaqsiyad --help
```

## Tests

```sh
PYTHONPATH=src python -m unittest discover -s tests
```
