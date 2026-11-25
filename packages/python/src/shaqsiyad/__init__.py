"""Client for the Shaqsiyad API: fictional people with faces, ethnicity, faith, careers and connections."""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Sequence, TypedDict, Union

from .snapshot import SnapshotStore, load as _load_snapshot, offline_message

__version__ = "0.3.0"
DEFAULT_BASE_URL = "https://shaqsiyad.example/api/v1"

__all__ = [
    "Shaqsiyad",
    "ShaqsiyadError",
    "DEFAULT_BASE_URL",
    "__version__",
    "pull_snapshot",
    "UserFixture",
    "CustomerFixture",
    "EmployeeFixture",
    "PatientFixture",
]


class Address(TypedDict, total=False):
    street: str
    city: str
    postcode: str
    country: str


class UserFixture(TypedDict, total=False):
    """``shape="users"``. The API may add more keys than these."""

    id: str
    fullName: str
    email: str


class CustomerFixture(UserFixture, total=False):
    """``shape="customers"``."""

    customerNumber: str
    phone: str
    address: Address
    company: Optional[str]
    incomeBand: str
    customerSince: str


class EmployeeFixture(UserFixture, total=False):
    """``shape="employees"``. Only the common fields are typed so far."""


class PatientFixture(UserFixture, total=False):
    """``shape="patients"``. Only the common fields are typed so far."""

_EXPORT_PATHS = {"personas": "/personas", "random": "/personas/random", "fixtures": "/fixtures"}


def _camel(key: str) -> str:
    """min_age -> minAge, so Python callers can use either spelling."""
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), key)


class ShaqsiyadError(Exception):
    """An API or network error. ``status`` is the HTTP status, or 0 for network errors and timeouts."""

    def __init__(self, status: int, message: str):
        super().__init__(f"{status}: {message}" if status else message)
        self.status = status
        self.message = message


class Shaqsiyad:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        retries: int = 1,
        snapshot: Union[str, "os.PathLike[str]", Dict[str, Any], None] = None,
    ):
        """``snapshot``: a file written by ``shaqsiyad pull`` (or its parsed dict). When set, ``random``,
        ``search``, ``search_all``, ``person``, ``fixtures`` (users, customers) and ``stats`` work offline."""
        self.base_url = (base_url or os.environ.get("SHAQSIYAD_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self._store: Optional[SnapshotStore] = SnapshotStore(_load_snapshot(snapshot)) if snapshot is not None else None

    @property
    def offline(self) -> bool:
        return self._store is not None

    def _online_only(self, what: str) -> None:
        if self._store is not None:
            raise ShaqsiyadError(0, offline_message(what))

    def url(self, path: str, **query: Any) -> str:
        pairs = []
        for key, value in query.items():
            if value is None or value == "":
                continue
            for item in value if isinstance(value, (list, tuple)) else [value]:
                pairs.append((_camel(key), str(item).lower() if isinstance(item, bool) else str(item)))
        qs = urllib.parse.urlencode(pairs)
        return f"{self.base_url}{path}{'?' + qs if qs else ''}"

    def _get(self, path: str, _attempt: int = 0, **query: Any) -> bytes:
        try:
            with urllib.request.urlopen(self.url(path, **query), timeout=self.timeout) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            if (err.code == 429 or err.code >= 500) and _attempt < self.retries:
                try:
                    wait = float(err.headers.get("retry-after", ""))
                except ValueError:
                    wait = 2.0**_attempt
                time.sleep(max(wait, 0))
                return self._get(path, _attempt + 1, **query)
            try:
                message = json.loads(err.read()).get("error", err.reason)
            except (ValueError, AttributeError):
                message = err.reason
            raise ShaqsiyadError(err.code, str(message)) from None
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            reason = getattr(err, "reason", err)
            raise ShaqsiyadError(0, str(reason)) from None

    def _json(self, path: str, **query: Any) -> Any:
        return json.loads(self._get(path, **query))

    def search(self, q: Optional[str] = None, **params: Any) -> Dict[str, Any]:
        if self._store is not None:
            return self._store.search(q, **params)
        return self._json("/personas", q=q, **params)

    def search_all(self, q: Optional[str] = None, max: Optional[int] = None, **params: Any) -> Iterator[Dict[str, Any]]:
        """Every match across all pages, one summary at a time. Stops after ``max`` people if given."""
        params.setdefault("limit", 100)
        yielded = 0
        page = 1
        while True:
            result = self.search(q, page=page, **params)
            for person in result.get("results", []):
                if max is not None and yielded >= max:
                    return
                yielded += 1
                yield person
            if page >= result.get("pages", 0) or not result.get("results"):
                return
            page += 1

    def random(self, count: int = 5, **params: Any) -> List[Dict[str, Any]]:
        if self._store is not None:
            return self._store.random(count, **params)
        return self._json("/personas/random", count=count, **params)

    def person(self, id_or_slug: str, fields: Optional[Sequence[str]] = None) -> Dict[str, Any]:
        if self._store is not None:
            found = self._store.person(id_or_slug, fields)
            if found is None:
                raise ShaqsiyadError(404, f'No person "{id_or_slug}" in the snapshot')
            return found
        return self._json(f"/personas/{urllib.parse.quote(id_or_slug)}", fields=",".join(fields) if fields else None)

    def graph(self, id_or_slug: str, depth: int = 1) -> Dict[str, Any]:
        self._online_only("graph()")
        return self._json(f"/personas/{urllib.parse.quote(id_or_slug)}/graph", depth=depth)

    def fixtures(self, shape: str, **params: Any) -> List[Dict[str, Any]]:
        """Records for seeding a database. See ``UserFixture``, ``CustomerFixture`` and friends for the keys."""
        if self._store is not None:
            try:
                return self._store.fixtures(shape, **params)
            except ValueError as err:
                raise ShaqsiyadError(0, str(err)) from None
        return self._json("/fixtures", shape=shape, **params)

    def export(self, kind: str, fmt: str, **params: Any) -> str:
        """Raw CSV or NDJSON for ``personas`` (search), ``random`` or ``fixtures``."""
        if kind not in _EXPORT_PATHS:
            raise ValueError(f"kind must be one of {', '.join(_EXPORT_PATHS)}")
        self._online_only("export()")
        return self._get(_EXPORT_PATHS[kind], format=fmt, **params).decode("utf-8")

    def households(self, **params: Any) -> List[Dict[str, Any]]:
        self._online_only("households()")
        return self._json("/households", **params)

    def team(self, **params: Any) -> Dict[str, Any]:
        self._online_only("team()")
        return self._json("/teams", **params)

    def stats(self) -> Dict[str, Any]:
        if self._store is not None:
            return self._store.stats()
        return self._json("/stats")

    def avatar_url(self, id_or_slug: str, size: int = 512, fmt: str = "webp") -> str:
        return self.url(f"/personas/{urllib.parse.quote(id_or_slug)}/avatar", size=size, format=fmt)

    def sheet_url(self, **params: Any) -> str:
        return self.url("/sheet.png", **params)


def pull_snapshot(api: Shaqsiyad, count: int = 100, seed: int = 1, **filters: Any) -> Dict[str, Any]:
    """Download people for offline use (what ``shaqsiyad pull`` writes).

    Fetches in batches of 50 with seeds ``seed``, ``seed + 1``, … so the same arguments give the same snapshot.
    """
    people: List[Dict[str, Any]] = []
    seen = set()
    batch = 0
    while len(people) < count:
        want = min(50, count - len(people))
        got = api.random(want, seed=seed + batch, **filters)
        added = 0
        for p in got:
            if p.get("id") in seen or len(people) >= count:
                continue
            seen.add(p.get("id"))
            people.append(p)
            added += 1
        if len(got) < want or added == 0:
            break
        batch += 1
    params = {_camel(k): v for k, v in filters.items() if v is not None}
    params.update(count=count, seed=seed)
    return {
        "version": 1,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "baseUrl": api.base_url,
        "params": params,
        "people": people,
    }
