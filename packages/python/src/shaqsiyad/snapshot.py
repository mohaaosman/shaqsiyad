"""Offline snapshots: people saved by ``shaqsiyad pull`` and served without the network."""

import json
import math
import random as _random
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, TypeVar, Union

T = TypeVar("T")
_M = 0xFFFFFFFF

FILTER_KEYS = ["gender", "continent", "country", "ethnicity", "religion", "tier", "mbti", "relationship", "industry", "status"]


def mulberry32(seed: int) -> Callable[[], float]:
    """Seeded PRNG, bit-for-bit the same as the JS SDK's, so both pick the same people."""
    state = [seed & _M]

    def rand() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & _M
        t = state[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & _M
        t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & _M)) & _M)) & _M
        return ((t ^ (t >> 14)) & _M) / 4294967296

    return rand


def seeded_shuffle(items: Sequence[T], seed: int) -> List[T]:
    out = list(items)
    rand = mulberry32(seed)
    for i in range(len(out) - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out


def _obj(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _str(v: Any) -> str:
    return v if isinstance(v, str) else str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else ""


def facet(p: Dict[str, Any], key: str) -> str:
    """A filterable value from a complete person, tolerating the few places it can live."""
    if key == "religion":
        return p["religion"] if isinstance(p.get("religion"), str) else _str(_obj(p.get("religion")).get("name"))
    if key in ("industry", "status"):
        return _str(_obj(p.get("career")).get(key)) or _str(p.get(key))
    if key == "mbti":
        return _str(p.get("mbti")) or _str(_obj(p.get("personality")).get("mbti"))
    if key == "relationship":
        return p["relationship"] if isinstance(p.get("relationship"), str) else _str(_obj(p.get("relationship")).get("status"))
    return _str(p.get(key))


def _values(v: Any) -> List[str]:
    items: Iterable[Any] = v if isinstance(v, (list, tuple)) else [v]
    return [x.strip().lower() for item in items for x in str(item).split(",") if x.strip()]


def _camel(filters: Dict[str, Any]) -> Dict[str, Any]:
    alias = {"min_age": "minAge", "max_age": "maxAge"}
    return {alias.get(k, k): v for k, v in filters.items()}


def matches(p: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    f = _camel(filters)
    if f.get("minAge") is not None and p.get("age", 0) < int(f["minAge"]):
        return False
    if f.get("maxAge") is not None and p.get("age", 0) > int(f["maxAge"]):
        return False
    for key in FILTER_KEYS:
        wanted = f.get(key)
        if wanted is None or wanted == "":
            continue
        if facet(p, key).lower() not in _values(wanted):
            return False
    q = _str(f.get("q")).strip().lower()
    if q:
        hay = " ".join(_str(x) for x in [p.get("fullName"), p.get("city"), p.get("country"), _obj(p.get("career")).get("title"), p.get("ethnicity")]).lower()
        if q not in hay:
            return False
    return True


def summarize(p: Dict[str, Any]) -> Dict[str, Any]:
    avatar = _obj(p.get("avatar"))
    connections = p.get("connections", 0)
    return {
        "id": p.get("id"),
        "slug": _str(p.get("slug")),
        "fullName": p.get("fullName"),
        "firstName": _str(p.get("firstName")),
        "gender": p.get("gender"),
        "age": p.get("age"),
        "city": _str(p.get("city")),
        "country": _str(p.get("country")),
        "continent": _str(p.get("continent")),
        "ethnicity": _str(p.get("ethnicity")),
        "religion": facet(p, "religion"),
        "branch": _str(_obj(p.get("religion")).get("branch")),
        "title": _str(_obj(p.get("career")).get("title")),
        "industry": facet(p, "industry"),
        "relationship": facet(p, "relationship"),
        "mbti": facet(p, "mbti"),
        "tier": facet(p, "tier"),
        "overall": p.get("overall", 0),
        "tagline": _str(p.get("tagline")),
        "connections": len(connections) if isinstance(connections, list) else connections,
        "initials": _str(avatar.get("initials")),
        "avatar": _str(avatar.get("url")),
    }


def offline_message(what: str) -> str:
    return f"{what} is not available offline — the snapshot only holds people. Drop the `snapshot` option to use the API."


def load(source: Union[str, Dict[str, Any]]) -> Dict[str, Any]:
    if isinstance(source, (str, bytes)) or hasattr(source, "__fspath__"):
        with open(source, encoding="utf-8") as fh:  # type: ignore[arg-type]
            source = json.load(fh)
    if not isinstance(source, dict) or not isinstance(source.get("people"), list):
        raise ValueError("Not a Shaqsiyad snapshot: expected {'version': 1, 'people': [...]}")
    return source


class SnapshotStore:
    def __init__(self, snapshot: Dict[str, Any]):
        self.snapshot = snapshot
        self.people: List[Dict[str, Any]] = snapshot["people"]

    def _pick(self, filters: Dict[str, Any], count: int, seed: Optional[int]) -> List[Dict[str, Any]]:
        pool = [p for p in self.people if matches(p, filters)]
        return seeded_shuffle(pool, seed if seed is not None else _random.getrandbits(32))[:count]

    def random(self, count: int, seed: Optional[int] = None, **filters: Any) -> List[Dict[str, Any]]:
        return self._pick(filters, count, seed)

    def search(self, q: Optional[str] = None, page: Optional[int] = None, limit: Optional[int] = None, sort: Optional[str] = None, **filters: Any) -> Dict[str, Any]:
        page, limit = page or 1, limit or 20
        found = [p for p in self.people if matches(p, dict(filters, q=q))]
        if sort == "name":
            found.sort(key=lambda p: p.get("fullName", ""))
        pages = max(1, math.ceil(len(found) / limit))
        results = [summarize(p) for p in found[(page - 1) * limit : page * limit]]
        return {"total": len(found), "page": page, "limit": limit, "pages": pages, "sort": sort or "snapshot", "matched": None, "results": results}

    def person(self, id_or_slug: str, fields: Optional[Sequence[str]] = None) -> Optional[Dict[str, Any]]:
        for p in self.people:
            if p.get("id") == id_or_slug or p.get("slug") == id_or_slug:
                return {k: v for k, v in p.items() if k in fields or k == "id"} if fields else p
        return None

    def fixtures(self, shape: str, count: Optional[int] = None, seed: Optional[int] = None, **filters: Any) -> List[Dict[str, Any]]:
        if shape not in ("users", "customers"):
            raise ValueError(offline_message(f'The "{shape}" fixture shape'))
        out = []
        for p in self._pick(filters, count or 10, seed):
            contact = _obj(p.get("contact"))
            record: Dict[str, Any] = {"id": p.get("id"), "fullName": p.get("fullName"), "email": _str(contact.get("email"))}
            if shape == "customers":
                record.update(phone=_str(contact.get("phone")), address=_obj(contact.get("address")))
            out.append(record)
        return out

    def stats(self) -> Dict[str, Any]:
        def count(key: str) -> Dict[str, int]:
            out: Dict[str, int] = {}
            for p in self.people:
                v = facet(p, key)
                if v:
                    out[v] = out.get(v, 0) + 1
            return out

        return {
            "source": "snapshot",
            "createdAt": self.snapshot.get("createdAt"),
            "total": len(self.people),
            **{k: count(k) for k in ["gender", "continent", "country", "ethnicity", "religion", "industry"]},
        }
