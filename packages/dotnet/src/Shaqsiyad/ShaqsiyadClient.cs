using System.Globalization;
using System.Net;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Shaqsiyad;

/// <summary>Options for <see cref="ShaqsiyadClient"/>.</summary>
public sealed record ShaqsiyadOptions
{
    /// <summary>API root. Defaults to <c>SHAQSIYAD_BASE_URL</c>, then <see cref="ShaqsiyadClient.DefaultBaseUrl"/>.</summary>
    public string? BaseUrl { get; init; }
    /// <summary>Per-request timeout. Defaults to 30 seconds; <see cref="Timeout.InfiniteTimeSpan"/> disables it.</summary>
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
    /// <summary>How many times a 429 or 5xx is retried, honouring Retry-After. Defaults to 1.</summary>
    public int Retries { get; init; } = 1;
    /// <summary>A custom handler, for proxies or tests.</summary>
    public HttpMessageHandler? Handler { get; init; }
    /// <summary>How to wait between retries. Defaults to <see cref="Task.Delay(TimeSpan, CancellationToken)"/>.</summary>
    public Func<TimeSpan, CancellationToken, Task>? Delay { get; init; }
}

/// <summary>Client for the Shaqsiyad API. Safe for concurrent use.</summary>
public sealed class ShaqsiyadClient : IDisposable
{
    public const string Version = "0.1.0";
    public const string DefaultBaseUrl = "https://shaqsiyad.example/api/v1";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> ExportKinds = ["personas", "random", "fixtures"];
    private static readonly HashSet<string> ExportFormats = ["csv", "ndjson"];

    private readonly HttpClient _http;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;

    public string BaseUrl { get; }
    public TimeSpan Timeout { get; }
    public int Retries { get; }

    public ShaqsiyadClient(ShaqsiyadOptions? options = null)
    {
        options ??= new ShaqsiyadOptions();
        var baseUrl = options.BaseUrl ?? Environment.GetEnvironmentVariable("SHAQSIYAD_BASE_URL");
        BaseUrl = (string.IsNullOrEmpty(baseUrl) ? DefaultBaseUrl : baseUrl).TrimEnd('/');
        Timeout = options.Timeout;
        Retries = options.Retries;
        _delay = options.Delay ?? Task.Delay;
        _http = options.Handler is null ? new HttpClient() : new HttpClient(options.Handler, disposeHandler: false);
        _http.Timeout = System.Threading.Timeout.InfiniteTimeSpan; // per-request timeouts are applied below
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"shaqsiyad-dotnet/{Version}");
    }

    /// <summary>Builds a full request URL. Null and empty values are dropped.</summary>
    public string Url(string path, Query? query = null)
    {
        var qs = query?.ToString();
        return string.IsNullOrEmpty(qs) ? BaseUrl + path : $"{BaseUrl}{path}?{qs}";
    }

    private static string Id(string idOrSlug) => Uri.EscapeDataString(idOrSlug);

    private async Task<string> GetAsync(string path, Query? query, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var (status, body, retryAfter) = await OnceAsync(path, query, ct).ConfigureAwait(false);
            if ((status == 429 || status >= 500) && attempt < Retries)
            {
                var wait = retryAfter ?? TimeSpan.FromSeconds(Math.Pow(2, attempt));
                try { await _delay(wait, ct).ConfigureAwait(false); }
                catch (OperationCanceledException e) { throw new ShaqsiyadException(0, "Cancelled", e); }
                continue;
            }
            if (status is < 200 or >= 300)
            {
                var message = ((HttpStatusCode)status).ToString();
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                        message = err.GetString()!;
                }
                catch (JsonException) { }
                throw new ShaqsiyadException(status, message);
            }
            return body;
        }
    }

    private async Task<(int Status, string Body, TimeSpan? RetryAfter)> OnceAsync(string path, Query? query, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (Timeout != System.Threading.Timeout.InfiniteTimeSpan && Timeout > TimeSpan.Zero) cts.CancelAfter(Timeout);
        try
        {
            using var res = await _http.GetAsync(Url(path, query), HttpCompletionOption.ResponseContentRead, cts.Token).ConfigureAwait(false);
            var body = await res.Content.ReadAsStringAsync(cts.Token).ConfigureAwait(false);
            return ((int)res.StatusCode, body, RetryAfter(res));
        }
        catch (OperationCanceledException e) when (!ct.IsCancellationRequested)
        {
            throw new ShaqsiyadException(0, $"Timed out after {Timeout.TotalMilliseconds}ms", e);
        }
        catch (OperationCanceledException e)
        {
            throw new ShaqsiyadException(0, "Cancelled", e);
        }
        catch (HttpRequestException e)
        {
            throw new ShaqsiyadException(0, e.Message, e);
        }
    }

    private static TimeSpan? RetryAfter(HttpResponseMessage res)
    {
        // Retry-After may be fractional seconds ("0.5"), which the typed header parser rejects, so read it raw.
        if (res.Headers.TryGetValues("Retry-After", out var values))
        {
            var raw = values.FirstOrDefault();
            if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) && seconds >= 0)
                return TimeSpan.FromSeconds(seconds);
            if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var when))
            {
                var delta = when - DateTimeOffset.UtcNow;
                return delta > TimeSpan.Zero ? delta : TimeSpan.Zero;
            }
        }
        return null;
    }

    private async Task<T> JsonAsync<T>(string path, Query? query, CancellationToken ct)
    {
        var body = await GetAsync(path, query, ct).ConfigureAwait(false);
        try
        {
            return JsonSerializer.Deserialize<T>(body, Json) ?? throw new ShaqsiyadException(0, "Empty response");
        }
        catch (JsonException e)
        {
            throw new ShaqsiyadException(0, "Bad JSON: " + e.Message, e);
        }
    }

    /// <summary>One page of matching summaries.</summary>
    public Task<SearchResult> SearchAsync(SearchParams? p = null, CancellationToken ct = default) =>
        JsonAsync<SearchResult>("/personas", (p ?? new()).ToQuery(), ct);

    /// <summary>Every match across all pages, one summary at a time. Stops after <paramref name="max"/> people if given.</summary>
    public async IAsyncEnumerable<PersonaSummary> SearchAllAsync(SearchParams? p = null, int? max = null, [EnumeratorCancellation] CancellationToken ct = default)
    {
        p = (p ?? new()) with { Limit = p?.Limit ?? 100 };
        var yielded = 0;
        for (var page = 1; ; page++)
        {
            var result = await SearchAsync(p with { Page = page }, ct).ConfigureAwait(false);
            foreach (var person in result.Results)
            {
                if (max is not null && yielded >= max) yield break;
                yielded++;
                yield return person;
            }
            if (page >= result.Pages || result.Results.Count == 0) yield break;
        }
    }

    /// <summary>Random people with complete profiles. Same seed + same filters → same people.</summary>
    public Task<IReadOnlyList<Persona>> RandomAsync(RandomParams? p = null, CancellationToken ct = default) =>
        JsonAsync<IReadOnlyList<Persona>>("/personas/random", (p ?? new()).ToQuery(), ct);

    /// <summary>One complete person by id or slug, trimmed to <paramref name="fields"/> if given.</summary>
    public Task<Persona> PersonAsync(string idOrSlug, IEnumerable<string>? fields = null, CancellationToken ct = default) =>
        JsonAsync<Persona>($"/personas/{Id(idOrSlug)}", new Query().Set("fields", fields is null ? null : string.Join(",", fields)), ct);

    /// <summary>A person's connections, depth 1 or 2.</summary>
    public Task<Graph> GraphAsync(string idOrSlug, int depth = 1, CancellationToken ct = default) =>
        JsonAsync<Graph>($"/personas/{Id(idOrSlug)}/graph", new Query().Set("depth", depth), ct);

    /// <summary>Records for seeding: <paramref name="shape"/> is users, customers, employees or patients.</summary>
    public Task<IReadOnlyList<Dictionary<string, JsonElement>>> FixturesAsync(string shape, FixtureParams? p = null, CancellationToken ct = default)
    {
        var q = new Query().Set("shape", shape);
        foreach (var (k, v) in (p ?? new()).ToQuery().Pairs) q.Add(k, v);
        return JsonAsync<IReadOnlyList<Dictionary<string, JsonElement>>>("/fixtures", q, ct);
    }

    /// <summary>Raw CSV or NDJSON. <paramref name="kind"/> is personas (a search), random or fixtures.</summary>
    public Task<string> ExportAsync(string kind, string format, Query? query = null, CancellationToken ct = default)
    {
        if (!ExportKinds.Contains(kind)) throw new ArgumentException("kind must be personas, random or fixtures", nameof(kind));
        if (!ExportFormats.Contains(format)) throw new ArgumentException("format must be csv or ndjson", nameof(format));
        var path = kind switch { "personas" => "/personas", "random" => "/personas/random", _ => "/fixtures" };
        var q = new Query();
        if (query is not null) foreach (var (k, v) in query.Pairs) if (k != "format") q.Add(k, v);
        q.Set("format", format);
        return GetAsync(path, q, ct);
    }

    /// <summary>People with partner and children.</summary>
    public Task<IReadOnlyList<Household>> HouseholdsAsync(RandomParams? p = null, CancellationToken ct = default) =>
        JsonAsync<IReadOnlyList<Household>>("/households", (p ?? new()).ToQuery(), ct);

    /// <summary>A manager and reports from one industry.</summary>
    public Task<Team> TeamAsync(TeamParams? p = null, CancellationToken ct = default)
    {
        p ??= new();
        return JsonAsync<Team>("/teams", new Query().Set("size", p.Size).Set("industry", p.Industry).Set("seed", p.Seed), ct);
    }

    /// <summary>Totals and every facet.</summary>
    public Task<Dictionary<string, JsonElement>> StatsAsync(CancellationToken ct = default) =>
        JsonAsync<Dictionary<string, JsonElement>>("/stats", null, ct);

    /// <summary>Portrait URL. Size is 64, 128, 256 or 512; format webp or png. Null uses the server default.</summary>
    public string AvatarUrl(string idOrSlug, int? size = null, string? format = null) =>
        Url($"/personas/{Id(idOrSlug)}/avatar", new Query().Set("size", size).Set("format", format));

    /// <summary>A PNG grid of faces and names.</summary>
    public string SheetUrl(RandomParams? p = null) => Url("/sheet.png", (p ?? new()).ToQuery());

    public void Dispose() => _http.Dispose();
}
