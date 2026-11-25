# Shaqsiyad for .NET

Client for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad): fictional people with faces, ethnicity, faith, careers and connections. .NET 8+, no dependencies beyond the BCL.

```sh
dotnet add package Shaqsiyad
```

```csharp
using Shaqsiyad;

using var api = new ShaqsiyadClient();

var cast = await api.RandomAsync(new RandomParams { Count = 8, Seed = 7, MinAge = 25, MaxAge = 40 });
var nurses = await api.SearchAsync(new SearchParams { Q = "nurse", Continent = "Africa", Limit = 10 });
var amina = await api.PersonAsync(cast[0].Id, fields: ["fullName", "career", "religion"]);
var users = await api.FixturesAsync("users", new FixtureParams { Count = 50, Seed = 1 });
var csv = await api.ExportAsync("fixtures", "csv", new Query().Set("shape", "employees").Set("count", 100).Set("seed", 2));
var team = await api.TeamAsync(new TeamParams { Size = 6, Industry = "Healthcare", Seed = 3 });
var face = api.AvatarUrl(cast[0].Id, size: 128);

// Every match, across pages
await foreach (var person in api.SearchAllAsync(new SearchParams { Religion = "Muslim", Country = "Kenya" }, max: 500))
    Console.WriteLine(person.FullName);
```

Same `Seed` + same filters → same people, every time. Fields not modelled on `Persona` (personality, childhood, likes…) are in `persona.Extra`.

## Options

```csharp
new ShaqsiyadClient(new ShaqsiyadOptions
{
    BaseUrl = "http://localhost:8000/api/v1", // or set SHAQSIYAD_BASE_URL
    Timeout = TimeSpan.FromSeconds(10),       // default 30s
    Retries = 2,                              // retries on 429/5xx, default 1
    Handler = myHandler                       // custom HttpMessageHandler for proxies or tests
});
```

Every call takes a `CancellationToken`. Errors throw `ShaqsiyadException` with `Status` (0 for network errors and timeouts) and `ApiMessage`. A `429` or `5xx` is retried after `Retry-After`.

## Develop

```sh
dotnet test
```
