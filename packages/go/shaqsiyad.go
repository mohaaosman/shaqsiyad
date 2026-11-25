// Package shaqsiyad is a client for the Shaqsiyad API: fictional people with
// faces, ethnicity, faith, careers and connections. Zero dependencies.
package shaqsiyad

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"iter"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version of this SDK.
const Version = "0.1.0"

// DefaultBaseURL is the public API root.
const DefaultBaseURL = "https://shaqsiyad.example/api/v1"

// Error is an API or network error. Status is the HTTP status, or 0 for network errors and timeouts.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string {
	if e.Status == 0 {
		return "shaqsiyad: " + e.Message
	}
	return fmt.Sprintf("shaqsiyad: %d %s", e.Status, e.Message)
}

// Filters narrow down people. Zero values are left out of the request.
type Filters struct {
	Q            string
	Gender       string // male or female
	MinAge       int
	MaxAge       int
	Continent    string
	Country      string
	Ethnicity    string
	Religion     string
	Tier         []string // radiant, luminous, warm, soft, muted
	MBTI         string
	Relationship string
	Industry     string
	Status       string
}

func (f Filters) apply(q url.Values) {
	set(q, "q", f.Q)
	set(q, "gender", f.Gender)
	setInt(q, "minAge", f.MinAge)
	setInt(q, "maxAge", f.MaxAge)
	set(q, "continent", f.Continent)
	set(q, "country", f.Country)
	set(q, "ethnicity", f.Ethnicity)
	set(q, "religion", f.Religion)
	for _, t := range f.Tier {
		if t != "" {
			q.Add("tier", t)
		}
	}
	set(q, "mbti", f.MBTI)
	set(q, "relationship", f.Relationship)
	set(q, "industry", f.Industry)
	set(q, "status", f.Status)
}

func set(q url.Values, k, v string) {
	if v != "" {
		q.Set(k, v)
	}
}

func setInt(q url.Values, k string, v int) {
	if v != 0 {
		q.Set(k, strconv.Itoa(v))
	}
}

func setSeed(q url.Values, seed *int) {
	if seed != nil {
		q.Set("seed", strconv.Itoa(*seed))
	}
}

// Seed returns a pointer for the Seed fields, so seed 0 can be sent.
func Seed(n int) *int { return &n }

// PersonaSummary is the short form returned by search and in graphs and teams.
type PersonaSummary struct {
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	FullName     string  `json:"fullName"`
	FirstName    string  `json:"firstName"`
	Gender       string  `json:"gender"`
	Age          int     `json:"age"`
	City         string  `json:"city"`
	Country      string  `json:"country"`
	Continent    string  `json:"continent"`
	Ethnicity    string  `json:"ethnicity"`
	Religion     string  `json:"religion"`
	Branch       string  `json:"branch"`
	Title        string  `json:"title"`
	Industry     string  `json:"industry"`
	Relationship string  `json:"relationship"`
	MBTI         string  `json:"mbti"`
	Tier         string  `json:"tier"`
	Overall      float64 `json:"overall"`
	Tagline      string  `json:"tagline"`
	Connections  int     `json:"connections"`
	Initials     string  `json:"initials"`
	Avatar       string  `json:"avatar"`
}

// Address is a fictional postal address.
type Address struct {
	Street   string `json:"street"`
	City     string `json:"city"`
	Postcode string `json:"postcode"`
	Country  string `json:"country"`
}

// Persona is one complete person. Fields not modelled here are kept in Raw.
type Persona struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	FullName    string `json:"fullName"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Gender      string `json:"gender"`
	Age         int    `json:"age"`
	BirthDate   string `json:"birthDate"`
	City        string `json:"city"`
	Country     string `json:"country"`
	Continent   string `json:"continent"`
	Nationality string `json:"nationality"`
	Ethnicity   string `json:"ethnicity"`
	Religion    struct {
		Name       string   `json:"name"`
		Branch     string   `json:"branch"`
		Observance *string  `json:"observance"`
		Practices  []string `json:"practices"`
	} `json:"religion"`
	Contact struct {
		Email   string  `json:"email"`
		Phone   string  `json:"phone"`
		Address Address `json:"address"`
	} `json:"contact"`
	Avatar struct {
		URL      string            `json:"url"`
		Sizes    map[string]string `json:"sizes"`
		Prompt   string            `json:"prompt"`
		Initials string            `json:"initials"`
	} `json:"avatar"`
	Career struct {
		Status   string  `json:"status"`
		Title    string  `json:"title"`
		Industry string  `json:"industry"`
		Company  *string `json:"company"`
	} `json:"career"`

	// Raw holds every top-level field from the response, including the ones above.
	Raw map[string]json.RawMessage `json:"-"`
}

// UnmarshalJSON fills the typed fields and keeps the whole object in Raw.
func (p *Persona) UnmarshalJSON(b []byte) error {
	type plain Persona
	if err := json.Unmarshal(b, (*plain)(p)); err != nil {
		return err
	}
	return json.Unmarshal(b, &p.Raw)
}

// SearchResult is one page of search results.
type SearchResult struct {
	Total   int              `json:"total"`
	Page    int              `json:"page"`
	Limit   int              `json:"limit"`
	Pages   int              `json:"pages"`
	Sort    string           `json:"sort"`
	Matched *string          `json:"matched"`
	Results []PersonaSummary `json:"results"`
}

// Edge links two people in a Graph.
type Edge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Kind   string `json:"kind"`
	Year   int    `json:"year"`
}

// Graph is a person's connections as nodes and edges.
type Graph struct {
	Nodes []PersonaSummary `json:"nodes"`
	Edges []Edge           `json:"edges"`
}

// Child in a Household.
type Child struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

// Household is a person with partner and children.
type Household struct {
	Head     PersonaSummary `json:"head"`
	Partner  *string        `json:"partner"`
	Children []Child        `json:"children"`
	Address  Address        `json:"address"`
	Size     int            `json:"size"`
}

// Team is a manager and reports in one industry.
type Team struct {
	Industry string           `json:"industry"`
	Manager  PersonaSummary   `json:"manager"`
	Members  []PersonaSummary `json:"members"`
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL points the client at another API root.
func WithBaseURL(u string) Option { return func(c *Client) { c.BaseURL = strings.TrimRight(u, "/") } }

// WithHTTPClient uses a custom *http.Client (for proxies or tests).
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.HTTP = h } }

// WithTimeout sets the per-request timeout (default 30s; 0 disables).
func WithTimeout(d time.Duration) Option { return func(c *Client) { c.Timeout = d } }

// WithRetries sets how many times a 429 or 5xx is retried (default 1).
func WithRetries(n int) Option { return func(c *Client) { c.Retries = n } }

// Client talks to the Shaqsiyad API. Safe for concurrent use.
type Client struct {
	BaseURL string
	HTTP    *http.Client
	Timeout time.Duration
	Retries int
}

// New returns a client. The base URL comes from WithBaseURL, then SHAQSIYAD_BASE_URL, then DefaultBaseURL.
func New(opts ...Option) *Client {
	base := os.Getenv("SHAQSIYAD_BASE_URL")
	if base == "" {
		base = DefaultBaseURL
	}
	c := &Client{BaseURL: strings.TrimRight(base, "/"), HTTP: http.DefaultClient, Timeout: 30 * time.Second, Retries: 1}
	for _, o := range opts {
		o(c)
	}
	return c
}

// URL builds a full request URL. Empty values are dropped.
func (c *Client) URL(path string, q url.Values) string {
	clean := url.Values{}
	for k, vs := range q {
		for _, v := range vs {
			if v != "" {
				clean.Add(k, v)
			}
		}
	}
	if s := clean.Encode(); s != "" {
		return c.BaseURL + path + "?" + s
	}
	return c.BaseURL + path
}

func (c *Client) get(ctx context.Context, path string, q url.Values) ([]byte, error) {
	for attempt := 0; ; attempt++ {
		body, status, header, err := c.once(ctx, path, q)
		if err != nil {
			return nil, err
		}
		if (status == 429 || status >= 500) && attempt < c.Retries {
			wait := math.Pow(2, float64(attempt))
			if s, perr := strconv.ParseFloat(header.Get("Retry-After"), 64); perr == nil && s >= 0 {
				wait = s
			}
			select {
			case <-time.After(time.Duration(wait * float64(time.Second))):
				continue
			case <-ctx.Done():
				return nil, &Error{Status: 0, Message: ctx.Err().Error()}
			}
		}
		if status < 200 || status >= 300 {
			msg := http.StatusText(status)
			var e struct {
				Error string `json:"error"`
			}
			if json.Unmarshal(body, &e) == nil && e.Error != "" {
				msg = e.Error
			}
			return nil, &Error{Status: status, Message: msg}
		}
		return body, nil
	}
}

func (c *Client) once(ctx context.Context, path string, q url.Values) ([]byte, int, http.Header, error) {
	if c.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, c.Timeout)
		defer cancel()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.URL(path, q), nil)
	if err != nil {
		return nil, 0, nil, &Error{Status: 0, Message: err.Error()}
	}
	req.Header.Set("User-Agent", "shaqsiyad-go/"+Version)
	res, err := c.HTTP.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, 0, nil, &Error{Status: 0, Message: fmt.Sprintf("timed out after %s", c.Timeout)}
		}
		return nil, 0, nil, &Error{Status: 0, Message: err.Error()}
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, 0, nil, &Error{Status: 0, Message: err.Error()}
	}
	return body, res.StatusCode, res.Header, nil
}

func (c *Client) json(ctx context.Context, path string, q url.Values, out any) error {
	body, err := c.get(ctx, path, q)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, out); err != nil {
		return &Error{Status: 0, Message: "bad JSON: " + err.Error()}
	}
	return nil
}

// SearchParams for Search and SearchAll.
type SearchParams struct {
	Filters
	Sort  string
	Page  int
	Limit int
	Max   int // SearchAll only: stop after this many people (0 = no limit)
}

func (p SearchParams) values() url.Values {
	q := url.Values{}
	p.Filters.apply(q)
	set(q, "sort", p.Sort)
	setInt(q, "page", p.Page)
	setInt(q, "limit", p.Limit)
	return q
}

// Search returns one page of matching summaries.
func (c *Client) Search(ctx context.Context, p SearchParams) (*SearchResult, error) {
	var r SearchResult
	return &r, c.json(ctx, "/personas", p.values(), &r)
}

// SearchAll yields every match across all pages, stopping after p.Max if set.
//
//	for person, err := range api.SearchAll(ctx, params) { ... }
func (c *Client) SearchAll(ctx context.Context, p SearchParams) iter.Seq2[PersonaSummary, error] {
	return func(yield func(PersonaSummary, error) bool) {
		if p.Limit == 0 {
			p.Limit = 100
		}
		n := 0
		for page := 1; ; page++ {
			p.Page = page
			r, err := c.Search(ctx, p)
			if err != nil {
				yield(PersonaSummary{}, err)
				return
			}
			for _, person := range r.Results {
				if p.Max > 0 && n >= p.Max {
					return
				}
				n++
				if !yield(person, nil) {
					return
				}
			}
			if page >= r.Pages || len(r.Results) == 0 {
				return
			}
		}
	}
}

// RandomParams for Random and Export.
type RandomParams struct {
	Filters
	Count int
	Seed  *int
}

func (p RandomParams) values() url.Values {
	q := url.Values{}
	setInt(q, "count", p.Count)
	setSeed(q, p.Seed)
	p.Filters.apply(q)
	return q
}

// Random returns complete random people. Same Seed + same filters → same people.
func (c *Client) Random(ctx context.Context, p RandomParams) ([]Persona, error) {
	var r []Persona
	return r, c.json(ctx, "/personas/random", p.values(), &r)
}

// Person returns one complete person by id or slug, trimmed to fields if given.
func (c *Client) Person(ctx context.Context, idOrSlug string, fields ...string) (*Persona, error) {
	q := url.Values{}
	set(q, "fields", strings.Join(fields, ","))
	var p Persona
	return &p, c.json(ctx, "/personas/"+url.PathEscape(idOrSlug), q, &p)
}

// Graph returns a person's connections (depth 1 or 2).
func (c *Client) Graph(ctx context.Context, idOrSlug string, depth int) (*Graph, error) {
	q := url.Values{}
	setInt(q, "depth", depth)
	var g Graph
	return &g, c.json(ctx, "/personas/"+url.PathEscape(idOrSlug)+"/graph", q, &g)
}

// FixtureParams for Fixtures.
type FixtureParams struct {
	Filters
	Count int
	Seed  *int
}

// Fixtures returns records for seeding: shape is users, customers, employees or patients.
func (c *Client) Fixtures(ctx context.Context, shape string, p FixtureParams) ([]map[string]any, error) {
	q := url.Values{}
	q.Set("shape", shape)
	setInt(q, "count", p.Count)
	setSeed(q, p.Seed)
	p.Filters.apply(q)
	var r []map[string]any
	return r, c.json(ctx, "/fixtures", q, &r)
}

var exportPaths = map[string]string{"personas": "/personas", "random": "/personas/random", "fixtures": "/fixtures"}

// Export returns raw CSV or NDJSON. kind is personas (a search), random or fixtures.
// Pass any query values (shape, count, seed, filters) in q.
func (c *Client) Export(ctx context.Context, kind, format string, q url.Values) (string, error) {
	path, ok := exportPaths[kind]
	if !ok {
		return "", fmt.Errorf("shaqsiyad: kind must be personas, random or fixtures, not %q", kind)
	}
	if format != "csv" && format != "ndjson" {
		return "", fmt.Errorf("shaqsiyad: format must be csv or ndjson, not %q", format)
	}
	all := url.Values{}
	for k, v := range q {
		all[k] = append([]string(nil), v...)
	}
	all.Set("format", format)
	body, err := c.get(ctx, path, all)
	return string(body), err
}

// Households returns people with partner and children.
func (c *Client) Households(ctx context.Context, p RandomParams) ([]Household, error) {
	var r []Household
	return r, c.json(ctx, "/households", p.values(), &r)
}

// TeamParams for Team.
type TeamParams struct {
	Size     int
	Industry string
	Seed     *int
}

// Team returns a manager and reports from one industry.
func (c *Client) Team(ctx context.Context, p TeamParams) (*Team, error) {
	q := url.Values{}
	setInt(q, "size", p.Size)
	set(q, "industry", p.Industry)
	setSeed(q, p.Seed)
	var t Team
	return &t, c.json(ctx, "/teams", q, &t)
}

// Stats returns totals and every facet.
func (c *Client) Stats(ctx context.Context) (map[string]any, error) {
	var r map[string]any
	return r, c.json(ctx, "/stats", nil, &r)
}

// AvatarURL is a portrait URL. size is 64, 128, 256 or 512 (0 = server default); format webp or png ("" = default).
func (c *Client) AvatarURL(idOrSlug string, size int, format string) string {
	q := url.Values{}
	setInt(q, "size", size)
	set(q, "format", format)
	return c.URL("/personas/"+url.PathEscape(idOrSlug)+"/avatar", q)
}

// SheetURL is a PNG grid of faces and names.
func (c *Client) SheetURL(p RandomParams) string {
	return c.URL("/sheet.png", p.values())
}
