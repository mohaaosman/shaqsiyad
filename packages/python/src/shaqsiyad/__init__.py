"""Client for the Shaqsiyad API: fictional people with faces, ethnicity, faith, careers and connections."""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterator, List, Optional, Sequence

__version__ = "0.2.0"
DEFAULT_BASE_URL = "https://shaqsiyad.example/api/v1"

__all__ = ["Shaqsiyad", "ShaqsiyadError", "DEFAULT_BASE_URL", "__version__"]

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
    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0, retries: int = 1):
        self.base_url = (base_url or os.environ.get("SHAQSIYAD_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.retries = retries

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
        return self._json("/personas/random", count=count, **params)

    def person(self, id_or_slug: str, fields: Optional[Sequence[str]] = None) -> Dict[str, Any]:
        return self._json(f"/personas/{urllib.parse.quote(id_or_slug)}", fields=",".join(fields) if fields else None)

    def graph(self, id_or_slug: str, depth: int = 1) -> Dict[str, Any]:
        return self._json(f"/personas/{urllib.parse.quote(id_or_slug)}/graph", depth=depth)

    def fixtures(self, shape: str, **params: Any) -> List[Dict[str, Any]]:
        return self._json("/fixtures", shape=shape, **params)

    def export(self, kind: str, fmt: str, **params: Any) -> str:
        """Raw CSV or NDJSON for ``personas`` (search), ``random`` or ``fixtures``."""
        if kind not in _EXPORT_PATHS:
            raise ValueError(f"kind must be one of {', '.join(_EXPORT_PATHS)}")
        return self._get(_EXPORT_PATHS[kind], format=fmt, **params).decode("utf-8")

    def households(self, **params: Any) -> List[Dict[str, Any]]:
        return self._json("/households", **params)

    def team(self, **params: Any) -> Dict[str, Any]:
        return self._json("/teams", **params)

    def stats(self) -> Dict[str, Any]:
        return self._json("/stats")

    def avatar_url(self, id_or_slug: str, size: int = 512, fmt: str = "webp") -> str:
        return self.url(f"/personas/{urllib.parse.quote(id_or_slug)}/avatar", size=size, format=fmt)

    def sheet_url(self, **params: Any) -> str:
        return self.url("/sheet.png", **params)
