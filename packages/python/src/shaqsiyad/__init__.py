import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Union

DEFAULT_BASE_URL = "https://shaqsiyad.example/api/v1"

__all__ = ["Shaqsiyad", "ShaqsiyadError", "DEFAULT_BASE_URL"]


class ShaqsiyadError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"{status}: {message}")
        self.status = status
        self.message = message


class Shaqsiyad:
    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0):
        self.base_url = (base_url or os.environ.get("SHAQSIYAD_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

    def url(self, path: str, **query: Any) -> str:
        pairs = []
        for key, value in query.items():
            if value is None:
                continue
            for item in value if isinstance(value, (list, tuple)) else [value]:
                pairs.append((key, str(item).lower() if isinstance(item, bool) else str(item)))
        qs = urllib.parse.urlencode(pairs)
        return f"{self.base_url}{path}{'?' + qs if qs else ''}"

    def _get(self, path: str, retried: bool = False, **query: Any) -> bytes:
        try:
            with urllib.request.urlopen(self.url(path, **query), timeout=self.timeout) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            if err.code == 429 and not retried:
                time.sleep(int(err.headers.get("retry-after", "1")))
                return self._get(path, True, **query)
            try:
                message = json.loads(err.read()).get("error", err.reason)
            except ValueError:
                message = err.reason
            raise ShaqsiyadError(err.code, message) from None

    def _json(self, path: str, **query: Any) -> Any:
        return json.loads(self._get(path, **query))

    def search(self, **params: Any) -> Dict[str, Any]:
        return self._json("/personas", **params)

    def random(self, count: int, **params: Any) -> List[Dict[str, Any]]:
        return self._json("/personas/random", count=count, **params)

    def person(self, id_or_slug: str) -> Dict[str, Any]:
        return self._json(f"/personas/{urllib.parse.quote(id_or_slug)}")

    def graph(self, id_or_slug: str, depth: int = 1) -> Dict[str, Any]:
        return self._json(f"/personas/{urllib.parse.quote(id_or_slug)}/graph", depth=depth)

    def fixtures(self, shape: str, **params: Any) -> List[Dict[str, Any]]:
        return self._json("/fixtures", shape=shape, **params)

    def export(self, kind: str, fmt: str, **params: Any) -> str:
        path = "/personas" if kind == "personas" else "/fixtures"
        return self._get(path, format=fmt, **params).decode("utf-8")

    def households(self, **params: Any) -> List[Dict[str, Any]]:
        return self._json("/households", **params)

    def team(self, **params: Any) -> Dict[str, Any]:
        return self._json("/teams", **params)

    def stats(self) -> Dict[str, Any]:
        return self._json("/stats")

    def avatar_url(self, id_or_slug: str, size: int = 512, fmt: str = "webp") -> str:
        return self.url(f"/personas/{urllib.parse.quote(id_or_slug)}/avatar", size=size, format=fmt)

    def sheet_url(self, **params: Union[str, int]) -> str:
        return self.url("/sheet.png", **params)
