import io
import json
import os
import tempfile
import unittest
import urllib.request
from unittest import mock

from shaqsiyad import Shaqsiyad, ShaqsiyadError, pull_snapshot
from shaqsiyad.__main__ import main
from shaqsiyad.faker import ShaqsiyadFaker, create_faker
from shaqsiyad.snapshot import mulberry32, seeded_shuffle

BASE = "https://api.test/v1"


def person(i, **over):
    p = {
        "id": f"shq_{i:05d}",
        "slug": f"person-{i}",
        "fullName": f"Person {i} Example",
        "firstName": "Person",
        "lastName": f"{i} Example",
        "gender": "female" if i % 2 else "male",
        "age": 20 + i,
        "city": "Nairobi" if i % 3 else "Mogadishu",
        "country": "Kenya" if i % 3 else "Somalia",
        "continent": "Africa",
        "ethnicity": "Kikuyu" if i % 3 else "Somali",
        "religion": {"name": "Muslim" if i % 2 else "Catholic", "branch": ""},
        "career": {"status": "Employed", "title": "Nurse" if i % 4 else "Engineer", "industry": "Healthcare", "company": None},
        "contact": {"email": f"p{i}@example.com", "phone": f"+254 700 000 {i}", "address": {"street": f"{i} Moi Ave", "city": "Nairobi", "postcode": "00100", "country": "Kenya"}},
        "avatar": {"url": f"/api/v1/personas/shq_{i}/avatar", "sizes": {}, "prompt": "", "initials": "PE"},
    }
    p.update(over)
    return p


SNAP = {"version": 1, "createdAt": "2026-11-24T00:00:00Z", "baseUrl": BASE, "params": {}, "people": [person(i + 1) for i in range(30)]}


def no_network(*args, **kwargs):
    raise AssertionError("network used in an offline test")


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_random_api(calls):
    """A urlopen stand-in that returns ``count`` people seeded by ``seed``."""

    def urlopen(url, timeout=None):
        from urllib.parse import parse_qs, urlparse

        q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
        calls.append(q)
        seed, n = int(q.get("seed", 0)), int(q["count"])
        return FakeResponse(json.dumps([person(seed * 1000 + i) for i in range(n)]).encode())

    return urlopen


@mock.patch.object(urllib.request, "urlopen", no_network)
class OfflineTest(unittest.TestCase):
    def api(self):
        return Shaqsiyad(base_url=BASE, snapshot=SNAP)

    def test_prng_matches_the_js_sdk(self):
        r = mulberry32(42)
        self.assertEqual([r(), r(), r()], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099])
        self.assertEqual(seeded_shuffle(list(range(10)), 7), [6, 5, 8, 1, 2, 3, 4, 7, 9, 0])

    def test_random_filters_and_is_seeded(self):
        api = self.api()
        self.assertTrue(api.offline)
        a = api.random(5, seed=3, country="kenya", religion="Muslim", min_age=22)
        b = api.random(5, seed=3, country="kenya", religion="Muslim", minAge=22)
        self.assertEqual([p["id"] for p in a], [p["id"] for p in b])
        self.assertEqual(len(a), 5)
        for p in a:
            self.assertTrue(p["country"] == "Kenya" and p["religion"]["name"] == "Muslim" and p["age"] >= 22)

    def test_search_and_search_all(self):
        api = self.api()
        r = api.search("nurse", limit=4, page=2)
        self.assertEqual((r["page"], len(r["results"])), (2, 4))
        self.assertIsInstance(r["results"][0]["religion"], str)
        self.assertEqual(len(list(api.search_all("NURSE", limit=4))), r["total"])

    def test_person(self):
        api = self.api()
        self.assertEqual(api.person("person-3")["id"], "shq_00003")
        self.assertEqual(sorted(api.person("shq_00003", fields=["fullName"])), ["fullName", "id"])
        with self.assertRaises(ShaqsiyadError) as ctx:
            api.person("nobody")
        self.assertEqual(ctx.exception.status, 404)

    def test_fixtures_and_unsupported_calls(self):
        api = self.api()
        self.assertEqual(sorted(api.fixtures("users", count=3, seed=1)[0]), ["email", "fullName", "id"])
        customer = api.fixtures("customers", count=2, seed=1)[0]
        self.assertEqual(customer["address"]["city"], "Nairobi")
        for call in (lambda: api.fixtures("patients"), api.households, lambda: api.graph("shq_00001"), lambda: api.export("random", "csv")):
            with self.assertRaisesRegex(ShaqsiyadError, "not available offline"):
                call()

    def test_stats(self):
        s = self.api().stats()
        self.assertEqual((s["total"], s["source"]), (30, "snapshot"))
        self.assertEqual(s["country"]["Kenya"] + s["country"]["Somalia"], 30)

    def test_snapshot_from_file_and_bad_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "people.json")
            with open(path, "w") as fh:
                json.dump(SNAP, fh)
            self.assertEqual(len(Shaqsiyad(snapshot=path).random(2, seed=1)), 2)
        with self.assertRaises(ValueError):
            Shaqsiyad(snapshot={"nope": 1})

    def test_faker_reads_current_person_until_next(self):
        fake = create_faker(seed=4, count=10, snapshot=SNAP, base_url=BASE)
        first = fake.current()
        self.assertEqual(fake.person.full_name(), first["fullName"])
        self.assertEqual(fake.person.last_name(), first["lastName"])
        self.assertEqual(fake.internet.email(), first["contact"]["email"])
        self.assertEqual(fake.location.street_address(), first["contact"]["address"]["street"])
        self.assertEqual(fake.image.avatar(), "https://api.test" + first["avatar"]["url"])
        second = fake.next()
        self.assertNotEqual(second["id"], first["id"])
        self.assertEqual(fake.person.full_name(), second["fullName"])
        for _ in range(9):
            fake.next()
        self.assertEqual(fake.current()["id"], first["id"])
        again = create_faker(seed=4, count=10, snapshot=SNAP)
        self.assertEqual([p["id"] for p in again.people], [p["id"] for p in fake.people])
        with self.assertRaises(ValueError):
            ShaqsiyadFaker([])


class PullTest(unittest.TestCase):
    def test_pull_batches_by_50_with_consecutive_seeds(self):
        calls = []
        with mock.patch.object(urllib.request, "urlopen", fake_random_api(calls)):
            snap = pull_snapshot(Shaqsiyad(base_url=BASE), 120, 5, country="Kenya", min_age=30)
        self.assertEqual((snap["version"], len(snap["people"])), (1, 120))
        self.assertEqual([(c["count"], c["seed"], c["country"]) for c in calls], [("50", "5", "Kenya"), ("50", "6", "Kenya"), ("20", "7", "Kenya")])
        self.assertEqual(snap["params"], {"country": "Kenya", "minAge": 30, "count": 120, "seed": 5})

    def test_pull_stops_when_matches_run_out(self):
        two = lambda url, timeout=None: FakeResponse(json.dumps([person(1), person(2)]).encode())  # noqa: E731
        with mock.patch.object(urllib.request, "urlopen", two):
            self.assertEqual(len(pull_snapshot(Shaqsiyad(base_url=BASE))["people"]), 2)

    def test_cli_pull_then_offline_random(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "people.json")
            out = io.StringIO()
            with mock.patch.object(urllib.request, "urlopen", fake_random_api([])):
                self.assertEqual(main(["--base-url", BASE, "pull", "--count", "7", "--seed", "2", "--out", path], out), 0)
            self.assertIn("Saved 7 people", out.getvalue())
            out = io.StringIO()
            with mock.patch.object(urllib.request, "urlopen", no_network):
                self.assertEqual(main(["--snapshot", path, "--compact", "random", "--count", "2", "--seed", "1"], out), 0)
            self.assertEqual(len(json.loads(out.getvalue())), 2)

    def test_faker_online_preloads(self):
        with mock.patch.object(urllib.request, "urlopen", fake_random_api([])):
            fake = create_faker(count=3, base_url=BASE)
        self.assertEqual(len(fake.people), 3)
        self.assertEqual(fake.person.sex(), "male")


if __name__ == "__main__":
    unittest.main()
