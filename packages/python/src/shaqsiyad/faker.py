"""A Faker-style facade over seeded Shaqsiyad people.

Every helper reads the *current* person, so ``person.full_name()``, ``internet.email()`` and
``image.avatar()`` all describe the same human. Call ``next()`` to move on (it wraps around).

    from shaqsiyad.faker import create_faker

    fake = create_faker(seed=1, country="Kenya")
    fake.person.full_name(), fake.internet.email()
    fake.next()
"""

import urllib.parse
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Sequence, Union

from . import Shaqsiyad, pull_snapshot

__all__ = ["ShaqsiyadFaker", "create_faker"]


class ShaqsiyadFaker:
    def __init__(self, people: Sequence[Dict[str, Any]], api: Optional[Shaqsiyad] = None):
        if not people:
            raise ValueError("No people matched — loosen the filters or use a bigger snapshot.")
        self.people: List[Dict[str, Any]] = list(people)
        self._api = api or Shaqsiyad()
        self._index = 0
        p = self.current
        contact = lambda: p().get("contact") or {}  # noqa: E731
        self.person = SimpleNamespace(
            full_name=lambda: p()["fullName"],
            first_name=lambda: p().get("firstName") or p()["fullName"].split(" ")[0],
            last_name=lambda: p().get("lastName") or " ".join(p()["fullName"].split(" ")[1:]),
            sex=lambda: p().get("gender"),
            job_title=lambda: (p().get("career") or {}).get("title", ""),
        )
        self.internet = SimpleNamespace(email=lambda: contact().get("email", ""))
        self.phone = SimpleNamespace(number=lambda: contact().get("phone", ""))
        self.location = SimpleNamespace(
            city=lambda: p().get("city", ""),
            country=lambda: p().get("country", ""),
            street_address=lambda: (contact().get("address") or {}).get("street", ""),
        )
        self.image = SimpleNamespace(avatar=self._avatar)

    def current(self) -> Dict[str, Any]:
        """The person the helpers are describing right now."""
        return self.people[self._index]

    def next(self) -> Dict[str, Any]:
        """Advance to the next person and return them."""
        self._index = (self._index + 1) % len(self.people)
        return self.current()

    def _avatar(self) -> str:
        url = (self.current().get("avatar") or {}).get("url")
        if not url:
            return self._api.avatar_url(self.current()["id"])
        return url if url.startswith(("http://", "https://")) else urllib.parse.urljoin(self._api.base_url, url)


def create_faker(
    seed: int = 1,
    count: int = 100,
    snapshot: Union[str, Dict[str, Any], None] = None,
    base_url: Optional[str] = None,
    **filters: Any,
) -> ShaqsiyadFaker:
    """Preload ``count`` seeded people (from the API or a snapshot) and return a Faker-style object."""
    api = Shaqsiyad(base_url=base_url, snapshot=snapshot)
    people = api.random(count, seed=seed, **filters) if api.offline else pull_snapshot(api, count, seed, **filters)["people"]
    return ShaqsiyadFaker(people, api)
