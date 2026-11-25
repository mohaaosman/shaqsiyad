"""Check that openapi.json, the Postman collection and both SDKs cover the same endpoints and filters.

Run: python3 scripts/check-contract.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
problems = []

spec = json.loads((ROOT / "openapi.json").read_text())
paths = {re.sub(r"\{[^}]+\}", ":id", p) for p in spec["paths"]}

for path, ops in spec["paths"].items():
    for method, op in ops.items():
        if "operationId" not in op and "summary" not in op:
            problems.append(f"openapi: {method.upper()} {path} has no summary")
        for code, resp in op.get("responses", {}).items():
            for media in resp.get("content", {}).values():
                ref = media.get("schema", {}).get("$ref") or media.get("schema", {}).get("items", {}).get("$ref")
                if ref and ref.split("/")[-1] not in spec["components"]["schemas"]:
                    problems.append(f"openapi: {path} {code} refers to missing schema {ref}")

fixture_schemas = ["UserFixture", "CustomerFixture", "EmployeeFixture", "PatientFixture"]
for name in fixture_schemas:
    if name not in spec["components"]["schemas"]:
        problems.append(f"openapi: missing schema {name}")
fixture_items = spec["paths"]["/fixtures"]["get"]["responses"]["200"]["content"]["application/json"]["schema"].get("items", {})
referenced = {ref["$ref"].split("/")[-1] for ref in fixture_items.get("anyOf", [])}
for name in fixture_schemas:
    if name not in referenced:
        problems.append(f"openapi: /fixtures response does not reference {name}")

postman = json.loads((ROOT / "postman/shaqsiyad.postman_collection.json").read_text())


def walk(items):
    for item in items:
        if "item" in item:
            yield from walk(item["item"])
        else:
            url = item["request"]["url"]
            yield (url if isinstance(url, str) else url["raw"]).replace("{{baseUrl}}", "").split("?")[0]


covered = set(walk(postman["item"]))
for missing in sorted(paths - covered):
    problems.append(f"postman: no request for {missing}")

filters = [p["name"] for p in spec["paths"]["/personas/random"]["get"]["parameters"] if p["name"] not in {"count", "seed", "format"}]
js = (ROOT / "packages/js/src/index.ts").read_text()
js_filters = re.search(r"export interface Filters \{(.*?)\}", js, re.S).group(1)
for name in filters:
    if not re.search(rf"\b{name}\?:", js_filters):
        problems.append(f"js: Filters is missing `{name}`")

mcp = (ROOT / "packages/mcp/src/server.ts").read_text()
mcp_filters = re.search(r"const filters = \{(.*?)\n\};", mcp, re.S).group(1)
for name in filters:
    if not re.search(rf"^\s+{name}:", mcp_filters, re.M):
        problems.append(f"mcp: filters is missing `{name}`")

for endpoint in ["/personas", "/personas/random", "/fixtures", "/households", "/teams", "/stats", "/sheet.png"]:
    for label, src in [("js", js), ("python", (ROOT / "packages/python/src/shaqsiyad/__init__.py").read_text())]:
        if f"'{endpoint}'" not in src and f'"{endpoint}"' not in src:
            problems.append(f"{label}: no call to {endpoint}")

py_src = (ROOT / "packages/python/src/shaqsiyad/__init__.py").read_text()
for name in fixture_schemas:
    if not re.search(rf"export (interface|type) {name}\b", js):
        problems.append(f"js: no {name} type")
    if not re.search(rf"^class {name}\(", py_src, re.M):
        problems.append(f"python: no {name} TypedDict")

# Go and C# name every filter explicitly; PHP and Ruby pass filters through, so only endpoints are checked there.
typed_sdks = {
    "go": [ROOT / "packages/go/shaqsiyad.go"],
    "dotnet": sorted((ROOT / "packages/dotnet/src/Shaqsiyad").glob("*.cs")),
}
passthrough_sdks = {
    "php": [ROOT / "packages/php/src/Shaqsiyad.php"],
    "ruby": [ROOT / "packages/ruby/lib/shaqsiyad.rb"],
}
for label, files in {**typed_sdks, **passthrough_sdks}.items():
    src = "\n".join(f.read_text() for f in files)
    for endpoint in ["/personas", "/personas/random", "/fixtures", "/households", "/teams", "/stats", "/sheet.png"]:
        if f'"{endpoint}' not in src and f"'{endpoint}" not in src:
            problems.append(f"{label}: no call to {endpoint}")
    if label in typed_sdks:
        for name in filters:
            if f'"{name}"' not in src:
                problems.append(f"{label}: filter `{name}` is never sent")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"ok: {len(paths)} endpoints, {len(filters)} filters and {len(fixture_schemas)} fixture shapes agree across openapi, postman, js, python, mcp, go, php, ruby and dotnet")
