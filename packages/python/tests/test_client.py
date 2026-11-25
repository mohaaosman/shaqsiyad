import io
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from shaqsiyad import Shaqsiyad, ShaqsiyadError
from shaqsiyad.__main__ import main


class FakeApi(BaseHTTPRequestHandler):
    """Answers from ``self.server.script``: a list of (status, body, headers) used in order, last one repeating."""

    def do_GET(self):  # noqa: N802
        self.server.calls.append(self.path)
        script = self.server.script
        status, body, headers = script.pop(0) if len(script) > 1 else script[0]
        if callable(body):
            body = body(urlparse(self.path))
        payload = body if isinstance(body, str) else json.dumps(body)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload.encode())

    def log_message(self, *args):
        pass


class ClientTest(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(("127.0.0.1", 0), FakeApi)
        self.server.calls = []
        self.server.script = [(200, {}, {})]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.api = Shaqsiyad(base_url=f"http://127.0.0.1:{self.server.server_port}/api/v1", timeout=5)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def respond(self, *script):
        self.server.script = list(script)

    def test_snake_case_filters_become_camel_case(self):
        self.respond((200, [{"id": "shq_1"}], {}))
        self.assertEqual(self.api.random(2, seed=7, min_age=30, maxAge=40), [{"id": "shq_1"}])
        self.assertEqual(self.server.calls[0], "/api/v1/personas/random?count=2&seed=7&minAge=30&maxAge=40")

    def test_url_skips_none_and_repeats_lists(self):
        self.assertTrue(self.api.url("/personas", q=None, tier=["warm", "soft"], full=True).endswith("/personas?tier=warm&tier=soft&full=true"))

    def test_person_fields(self):
        self.api.person("shq_1", fields=["fullName", "career"])
        self.assertEqual(self.server.calls[0], "/api/v1/personas/shq_1?fields=fullName%2Ccareer")

    def test_error_message_and_status(self):
        self.respond((404, {"error": "No such person"}, {}))
        with self.assertRaises(ShaqsiyadError) as ctx:
            self.api.person("nobody")
        self.assertEqual((ctx.exception.status, ctx.exception.message), (404, "No such person"))

    def test_retries_429_then_succeeds(self):
        self.respond((429, {"error": "slow down"}, {"retry-after": "0.01"}), (200, {"total": 3}, {}))
        self.assertEqual(self.api.stats(), {"total": 3})
        self.assertEqual(len(self.server.calls), 2)

    def test_gives_up_after_retries(self):
        self.respond((503, {"error": "down"}, {"retry-after": "0"}))
        with self.assertRaises(ShaqsiyadError) as ctx:
            Shaqsiyad(base_url=self.api.base_url, retries=2).stats()
        self.assertEqual(ctx.exception.status, 503)
        self.assertEqual(len(self.server.calls), 3)

    def test_network_error_is_status_zero(self):
        with self.assertRaises(ShaqsiyadError) as ctx:
            Shaqsiyad(base_url="http://127.0.0.1:1/api/v1", retries=0).stats()
        self.assertEqual(ctx.exception.status, 0)

    def test_search_all_walks_pages_and_honours_max(self):
        def page(url):
            n = int(parse_qs(url.query)["page"][0])
            return {"page": n, "pages": 3, "results": [{"id": f"{n}a"}, {"id": f"{n}b"}]}

        self.respond((200, page, {}))
        self.assertEqual([p["id"] for p in self.api.search_all("nurse")], ["1a", "1b", "2a", "2b", "3a", "3b"])
        self.assertEqual([p["id"] for p in self.api.search_all(max=3)], ["1a", "1b", "2a"])

    def test_export_kinds(self):
        self.respond((200, "id,name\n1,A\n", {}))
        self.assertEqual(self.api.export("random", "csv", count=1), "id,name\n1,A\n")
        self.assertEqual(self.server.calls[0], "/api/v1/personas/random?format=csv&count=1")
        with self.assertRaises(ValueError):
            self.api.export("nope", "csv")

    def test_cli_random_and_avatar(self):
        self.respond((200, [{"id": "shq_1"}], {}))
        out = io.StringIO()
        self.assertEqual(main(["--base-url", self.api.base_url, "--compact", "random", "--count", "1", "--min-age", "30"], out), 0)
        self.assertEqual(out.getvalue(), '[{"id": "shq_1"}]\n')
        self.assertIn("minAge=30", self.server.calls[0])

        out = io.StringIO()
        main(["--base-url", self.api.base_url, "avatar", "shq_1", "--size", "64"], out)
        self.assertTrue(out.getvalue().endswith("/personas/shq_1/avatar?size=64&format=webp\n"))

    def test_cli_reports_errors(self):
        self.respond((500, {"error": "boom"}, {}))
        err = io.StringIO()
        import sys

        old, sys.stderr = sys.stderr, err
        try:
            code = main(["--base-url", self.api.base_url, "stats"], io.StringIO())
        finally:
            sys.stderr = old
        self.assertEqual(code, 1)
        self.assertIn("500: boom", err.getvalue())


if __name__ == "__main__":
    unittest.main()
