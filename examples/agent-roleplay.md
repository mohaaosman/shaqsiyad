# Agents that role-play real-feeling users

The MCP server's `roleplay_user` prompt loads a person and asks the model to stay in character — their faith and observance, family, job, money and temperament shape what they want and how they write. Use it to stress-test a support bot, an onboarding flow or another agent.

```sh
claude mcp add shaqsiyad -- npx -y shaqsiyad-mcp
```

In Claude Code, run the prompt with `/mcp__shaqsiyad__roleplay_user shq_00042 "open a halal savings account"`, or ask in plain words:

> Use `random_people` with seed 3 to pick five people of different religions and ages. For each, role-play them trying to cancel a gym membership through our support bot at `./bot`, then summarise where the bot misunderstood them.

The same seed gives the same five people every run, so you can compare results before and after a change.

## Without MCP

```python
from shaqsiyad import Shaqsiyad

person = Shaqsiyad().person("shq_00042", fields=["fullName", "age", "religion", "family", "career", "personality"])
system = f"Role-play this fictional user, in character, trying to open a savings account:\n{person}"
```
