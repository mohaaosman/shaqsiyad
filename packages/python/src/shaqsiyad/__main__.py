"""Command line: ``python -m shaqsiyad random --count 3 --seed 1``."""

import argparse
import json
import sys
from typing import Any, Dict, List, Optional

from . import Shaqsiyad, ShaqsiyadError, __version__

FILTERS = ["gender", "min-age", "max-age", "continent", "country", "ethnicity", "religion", "tier", "mbti", "relationship", "industry", "status"]
INTS = {"min-age", "max-age"}


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="shaqsiyad", description="Fictional people with whole lives.")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("--base-url", help="API root (or set SHAQSIYAD_BASE_URL)")
    p.add_argument("--compact", action="store_true", help="one-line JSON")
    sub = p.add_subparsers(dest="command", required=True)

    def add(name: str, help: str, filters: bool = True) -> argparse.ArgumentParser:
        sp = sub.add_parser(name, help=help)
        if filters:
            for f in FILTERS:
                sp.add_argument(f"--{f}", type=int if f in INTS else str)
        return sp

    r = add("random", "random people")
    r.add_argument("--count", type=int, default=5)
    r.add_argument("--seed", type=int)
    r.add_argument("--format", choices=["json", "csv", "ndjson"], default="json")

    s = add("search", "search people")
    s.add_argument("q", nargs="?")
    s.add_argument("--limit", type=int)
    s.add_argument("--page", type=int)
    s.add_argument("--sort")
    s.add_argument("--all", action="store_true", help="every page, as NDJSON")
    s.add_argument("--max", type=int)
    s.add_argument("--format", choices=["json", "csv", "ndjson"], default="json")

    pe = add("person", "one complete person", filters=False)
    pe.add_argument("id")
    pe.add_argument("--fields", help="comma-separated top-level fields")

    g = add("graph", "connections around a person", filters=False)
    g.add_argument("id")
    g.add_argument("--depth", type=int, choices=[1, 2], default=1)

    fx = add("fixtures", "records for seeding a database")
    fx.add_argument("shape", choices=["users", "customers", "employees", "patients"])
    fx.add_argument("--count", type=int)
    fx.add_argument("--seed", type=int)
    fx.add_argument("--format", choices=["json", "csv", "ndjson"], default="json")

    h = add("households", "people with partner and children")
    h.add_argument("--count", type=int)
    h.add_argument("--seed", type=int)

    t = add("team", "a manager and reports", filters=False)
    t.add_argument("--size", type=int)
    t.add_argument("--industry")
    t.add_argument("--seed", type=int)

    add("stats", "totals and facets", filters=False)

    a = add("avatar", "portrait URL", filters=False)
    a.add_argument("id")
    a.add_argument("--size", type=int, choices=[64, 128, 256, 512], default=512)
    a.add_argument("--format", choices=["webp", "png"], default="webp")
    return p


def _filters(ns: argparse.Namespace) -> Dict[str, Any]:
    return {f.replace("-", "_"): getattr(ns, f.replace("-", "_"), None) for f in FILTERS}


def main(argv: Optional[List[str]] = None, out: Any = None) -> int:
    out = out or sys.stdout
    ns = _parser().parse_args(argv)
    api = Shaqsiyad(base_url=ns.base_url)

    def emit(data: Any) -> None:
        out.write(json.dumps(data, ensure_ascii=False, indent=None if ns.compact else 2) + "\n")

    try:
        c = ns.command
        if c == "random":
            if ns.format != "json":
                out.write(api.export("random", ns.format, count=ns.count, seed=ns.seed, **_filters(ns)))
            else:
                emit(api.random(ns.count, seed=ns.seed, **_filters(ns)))
        elif c == "search":
            params = dict(limit=ns.limit, sort=ns.sort, **_filters(ns))
            if ns.format != "json":
                out.write(api.export("personas", ns.format, q=ns.q, page=ns.page, **params))
            elif ns.all:
                for person in api.search_all(ns.q, max=ns.max, **{k: v for k, v in params.items() if v is not None}):
                    out.write(json.dumps(person, ensure_ascii=False) + "\n")
            else:
                emit(api.search(ns.q, page=ns.page, **params))
        elif c == "person":
            emit(api.person(ns.id, fields=ns.fields.split(",") if ns.fields else None))
        elif c == "graph":
            emit(api.graph(ns.id, ns.depth))
        elif c == "fixtures":
            if ns.format != "json":
                out.write(api.export("fixtures", ns.format, shape=ns.shape, count=ns.count, seed=ns.seed, **_filters(ns)))
            else:
                emit(api.fixtures(ns.shape, count=ns.count, seed=ns.seed, **_filters(ns)))
        elif c == "households":
            emit(api.households(count=ns.count, seed=ns.seed, **_filters(ns)))
        elif c == "team":
            emit(api.team(size=ns.size, industry=ns.industry, seed=ns.seed))
        elif c == "stats":
            emit(api.stats())
        elif c == "avatar":
            out.write(api.avatar_url(ns.id, size=ns.size, fmt=ns.format) + "\n")
    except ShaqsiyadError as err:
        sys.stderr.write(f"shaqsiyad: {err}\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
