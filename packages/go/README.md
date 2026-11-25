# shaqsiyad (Go)

Go client for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad): fictional people with faces, ethnicity, faith, careers and connections. Zero dependencies, Go 1.23+.

```sh
go get github.com/mohaaosman/shaqsiyad/packages/go
```

```go
import shaqsiyad "github.com/mohaaosman/shaqsiyad/packages/go"

api := shaqsiyad.New()
ctx := context.Background()

cast, err := api.Random(ctx, shaqsiyad.RandomParams{Count: 8, Seed: shaqsiyad.Seed(7), Filters: shaqsiyad.Filters{MinAge: 25, MaxAge: 40}})
amina, err := api.Person(ctx, cast[0].ID, "fullName", "career")
users, err := api.Fixtures(ctx, "users", shaqsiyad.FixtureParams{Count: 50, Seed: shaqsiyad.Seed(1)})
csv, err := api.Export(ctx, "fixtures", "csv", url.Values{"shape": {"employees"}, "count": {"100"}})
team, err := api.Team(ctx, shaqsiyad.TeamParams{Size: 6, Industry: "Healthcare"})
face := api.AvatarURL(cast[0].ID, 128, "png")

// Every match, across pages
for person, err := range api.SearchAll(ctx, shaqsiyad.SearchParams{Filters: shaqsiyad.Filters{Religion: "Muslim", Country: "Kenya"}, Max: 500}) {
	if err != nil { log.Fatal(err) }
	fmt.Println(person.FullName)
}
```

Same `Seed` + same filters → same people. `Persona.Raw` keeps every field of the full profile, typed or not.

## Options

```go
shaqsiyad.New(
	shaqsiyad.WithBaseURL("http://localhost:8000/api/v1"), // or SHAQSIYAD_BASE_URL
	shaqsiyad.WithTimeout(10*time.Second),                 // default 30s, 0 = none
	shaqsiyad.WithRetries(2),                              // 429/5xx retries, default 1
	shaqsiyad.WithHTTPClient(myClient),
)
```

Errors are `*shaqsiyad.Error` with `Status` (0 for network errors and timeouts) and the API's `Message`.

## Tests

```sh
go vet ./... && go test ./...
```
