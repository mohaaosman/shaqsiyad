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
employees = api.fixtures("employees", count=100, seed=2)
csv_text = api.export("fixtures", "csv", shape="users", count=50, seed=1)

for person in api.search_all(religion="Muslim", country="Kenya", max=500):
    print(person["fullName"])
```

Same `seed` + same filters → same people.

`Shaqsiyad(base_url=..., timeout=30.0, retries=1)` — or set `SHAQSIYAD_BASE_URL`. Errors raise `ShaqsiyadError` with `.status` (0 for network errors and timeouts). A `429` or `5xx` is retried after `retry-after`.

## CLI

```sh
shaqsiyad random --count 3 --seed 1 --country Somalia
shaqsiyad search "nurse who loves jazz" --limit 5
shaqsiyad fixtures users --count 100 --seed 1 --format csv > users.csv
shaqsiyad team --size 6 --industry Healthcare
python -m shaqsiyad --help
```

## Tests

```sh
PYTHONPATH=src python -m unittest discover -s tests
```
