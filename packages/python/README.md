# shaqsiyad

Python client for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Standard library only, Python 3.9+.

```sh
pip install shaqsiyad
```

```python
from shaqsiyad import Shaqsiyad

api = Shaqsiyad()
nurses = api.search(q="nurse", continent="Africa", limit=10)
cast = api.random(8, minAge=25, maxAge=40, seed=7)
employees = api.fixtures("employees", count=100, seed=2)
csv_text = api.export("fixtures", "csv", shape="users", count=50, seed=1)
```

Same `seed` + same filters → same people. Set `SHAQSIYAD_BASE_URL` or pass `Shaqsiyad(base_url=...)` to use another server. Errors raise `ShaqsiyadError` with `.status`.
