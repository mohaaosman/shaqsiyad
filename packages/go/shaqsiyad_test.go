package shaqsiyad

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"sync"
	"testing"
	"time"
)

type reply struct {
	status  int
	body    string
	headers map[string]string
}

// fake serves replies in order (the last one repeats) and records each request URI.
type fake struct {
	mu      sync.Mutex
	replies []reply
	calls   []string
	handler func(r *http.Request) reply
}

func (f *fake) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.calls = append(f.calls, r.URL.RequestURI())
	var rp reply
	if f.handler != nil {
		rp = f.handler(r)
	} else {
		rp = f.replies[0]
		if len(f.replies) > 1 {
			f.replies = f.replies[1:]
		}
	}
	f.mu.Unlock()
	for k, v := range rp.headers {
		w.Header().Set(k, v)
	}
	if rp.status == 0 {
		rp.status = 200
	}
	w.WriteHeader(rp.status)
	fmt.Fprint(w, rp.body)
}

func setup(t *testing.T, replies ...reply) (*Client, *fake) {
	t.Helper()
	f := &fake{replies: replies}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return New(WithBaseURL(srv.URL+"/api/v1/"), WithTimeout(5*time.Second)), f
}

func TestURLDropsEmptyAndRepeatsArrays(t *testing.T) {
	c := New(WithBaseURL("https://api.test/v1/"))
	q := url.Values{}
	SearchParams{Filters: Filters{Q: "nurse", Tier: []string{"warm", "soft"}}}.Filters.apply(q)
	q.Set("country", "")
	if got, want := c.URL("/personas", q), "https://api.test/v1/personas?q=nurse&tier=warm&tier=soft"; got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	if got, want := c.AvatarURL("amina farah", 128, ""), "https://api.test/v1/personas/amina%20farah/avatar?size=128"; got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestEnvBaseURL(t *testing.T) {
	t.Setenv("SHAQSIYAD_BASE_URL", "http://localhost:9/v1/")
	if got := New().BaseURL; got != "http://localhost:9/v1" {
		t.Fatalf("got %s", got)
	}
}

func TestRandomSendsFilters(t *testing.T) {
	c, f := setup(t, reply{body: `[{"id":"shq_1","fullName":"Amina Farah","hobbies":["chess"]}]`})
	people, err := c.Random(context.Background(), RandomParams{Count: 2, Seed: Seed(0), Filters: Filters{MinAge: 30}})
	if err != nil {
		t.Fatal(err)
	}
	if people[0].FullName != "Amina Farah" || string(people[0].Raw["hobbies"]) != `["chess"]` {
		t.Fatalf("bad person %+v", people[0])
	}
	if got, want := f.calls[0], "/api/v1/personas/random?count=2&minAge=30&seed=0"; got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestPersonFields(t *testing.T) {
	c, f := setup(t, reply{body: `{"id":"shq_1"}`})
	if _, err := c.Person(context.Background(), "shq_1", "fullName", "career"); err != nil {
		t.Fatal(err)
	}
	if got, want := f.calls[0], "/api/v1/personas/shq_1?fields=fullName%2Ccareer"; got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestErrorMessageAndStatus(t *testing.T) {
	c, _ := setup(t, reply{status: 404, body: `{"error":"No such person"}`})
	_, err := c.Person(context.Background(), "nobody")
	var e *Error
	if !errors.As(err, &e) || e.Status != 404 || e.Message != "No such person" {
		t.Fatalf("got %v", err)
	}
}

func TestRetries429ThenSucceeds(t *testing.T) {
	c, f := setup(t, reply{status: 429, headers: map[string]string{"Retry-After": "0.01"}}, reply{body: `{"total":3}`})
	stats, err := c.Stats(context.Background())
	if err != nil || stats["total"] != float64(3) || len(f.calls) != 2 {
		t.Fatalf("stats=%v err=%v calls=%d", stats, err, len(f.calls))
	}
}

func TestGivesUpAfterRetries(t *testing.T) {
	c, f := setup(t, reply{status: 503, body: `{"error":"down"}`, headers: map[string]string{"Retry-After": "0"}})
	c.Retries = 2
	_, err := c.Stats(context.Background())
	var e *Error
	if !errors.As(err, &e) || e.Status != 503 || len(f.calls) != 3 {
		t.Fatalf("err=%v calls=%d", err, len(f.calls))
	}
}

func TestNoRetryOn400(t *testing.T) {
	c, f := setup(t, reply{status: 400, body: `{"error":"bad"}`})
	if _, err := c.Stats(context.Background()); err == nil || len(f.calls) != 1 {
		t.Fatalf("err=%v calls=%d", err, len(f.calls))
	}
}

func TestNetworkErrorIsStatusZero(t *testing.T) {
	c := New(WithBaseURL("http://127.0.0.1:1/api/v1"), WithRetries(0))
	_, err := c.Stats(context.Background())
	var e *Error
	if !errors.As(err, &e) || e.Status != 0 {
		t.Fatalf("got %v", err)
	}
}

func TestSearchAllPagesAndMax(t *testing.T) {
	c, f := setup(t)
	f.handler = func(r *http.Request) reply {
		n, _ := strconv.Atoi(r.URL.Query().Get("page"))
		return reply{body: fmt.Sprintf(`{"page":%d,"pages":3,"results":[{"id":"%da"},{"id":"%db"}]}`, n, n, n)}
	}
	var ids []string
	for p, err := range c.SearchAll(context.Background(), SearchParams{Filters: Filters{Q: "nurse"}}) {
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, p.ID)
	}
	if fmt.Sprint(ids) != "[1a 1b 2a 2b 3a 3b]" {
		t.Fatalf("got %v", ids)
	}
	if got := f.calls[0]; got != "/api/v1/personas?limit=100&page=1&q=nurse" {
		t.Fatalf("got %s", got)
	}
	ids = nil
	for p := range c.SearchAll(context.Background(), SearchParams{Max: 3}) {
		ids = append(ids, p.ID)
	}
	if fmt.Sprint(ids) != "[1a 1b 2a]" {
		t.Fatalf("got %v", ids)
	}
}

func TestExport(t *testing.T) {
	c, f := setup(t, reply{body: "id,name\n1,A\n"})
	csv, err := c.Export(context.Background(), "random", "csv", url.Values{"count": {"1"}})
	if err != nil || csv != "id,name\n1,A\n" {
		t.Fatalf("csv=%q err=%v", csv, err)
	}
	if got := f.calls[0]; got != "/api/v1/personas/random?count=1&format=csv" {
		t.Fatalf("got %s", got)
	}
	if _, err := c.Export(context.Background(), "nope", "csv", nil); err == nil {
		t.Fatal("want error for bad kind")
	}
}

func TestFixturesTeamAndHouseholds(t *testing.T) {
	c, f := setup(t)
	f.handler = func(r *http.Request) reply {
		switch r.URL.Path {
		case "/api/v1/fixtures":
			return reply{body: `[{"email":"a@example.com"}]`}
		case "/api/v1/teams":
			return reply{body: `{"industry":"Healthcare","manager":{"id":"m"},"members":[{"id":"a"}]}`}
		default:
			return reply{body: `[{"head":{"id":"h"},"partner":null,"children":[{"name":"Ayan","age":4}],"size":2}]`}
		}
	}
	ctx := context.Background()
	fx, err := c.Fixtures(ctx, "users", FixtureParams{Count: 1, Seed: Seed(1)})
	if err != nil || fx[0]["email"] != "a@example.com" {
		t.Fatalf("fixtures=%v err=%v", fx, err)
	}
	team, err := c.Team(ctx, TeamParams{Size: 2, Industry: "Healthcare"})
	if err != nil || team.Manager.ID != "m" || len(team.Members) != 1 {
		t.Fatalf("team=%+v err=%v", team, err)
	}
	hh, err := c.Households(ctx, RandomParams{Count: 1})
	if err != nil || hh[0].Children[0].Name != "Ayan" {
		t.Fatalf("households=%+v err=%v", hh, err)
	}
	if f.calls[0] != "/api/v1/fixtures?count=1&seed=1&shape=users" {
		t.Fatalf("got %s", f.calls[0])
	}
}
