using System.Net;
using System.Text;
using Xunit;

namespace Shaqsiyad.Tests;

/// <summary>Answers from a queue of responses (the last one repeats) and records every URL requested.</summary>
internal sealed class FakeHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses;
    public List<string> Calls { get; } = [];

    public FakeHandler(params Func<HttpRequestMessage, HttpResponseMessage>[] responses) => _responses = new(responses);

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Calls.Add(request.RequestUri!.ToString());
        var next = _responses.Count > 1 ? _responses.Dequeue() : _responses.Peek();
        return Task.FromResult(next(request));
    }

    public static Func<HttpRequestMessage, HttpResponseMessage> Json(string body, int status = 200, string? retryAfter = null) => _ =>
    {
        var res = new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        if (retryAfter is not null) res.Headers.TryAddWithoutValidation("Retry-After", retryAfter);
        return res;
    };

    public static Func<HttpRequestMessage, HttpResponseMessage> Throws(Exception e) => _ => throw e;
}

public class ClientTests
{
    private const string Base = "https://api.test/v1";
    private readonly List<TimeSpan> _waits = [];

    private ShaqsiyadClient Client(FakeHandler handler, int retries = 1) => new(new ShaqsiyadOptions
    {
        BaseUrl = Base + "/",
        Handler = handler,
        Retries = retries,
        Delay = (wait, _) => { _waits.Add(wait); return Task.CompletedTask; }
    });

    private static string Page(int n, int pages, params string[] ids) =>
        $"{{\"total\":0,\"page\":{n},\"limit\":{ids.Length},\"pages\":{pages},\"sort\":\"relevance\",\"matched\":null,\"results\":[{string.Join(",", ids.Select(id => $"{{\"id\":\"{id}\"}}"))}]}}";

    [Fact]
    public void BuildsUrlsDroppingEmptyValuesAndRepeatingArrays()
    {
        using var api = Client(new FakeHandler(FakeHandler.Json("{}")));
        var q = new Query().Set("q", "nurse").AddAll("tier", ["warm", "soft"]).Set("gender", (string?)null).Set("country", "");
        Assert.Equal($"{Base}/personas?q=nurse&tier=warm&tier=soft", api.Url("/personas", q));
        Assert.Equal($"{Base}/personas/amina%20farah/avatar?size=128", api.AvatarUrl("amina farah", 128));
        Assert.Equal($"{Base}/sheet.png?count=12&seed=0&country=Kenya", api.SheetUrl(new RandomParams { Count = 12, Seed = 0, Country = "Kenya" }));
    }

    [Fact]
    public async Task RandomSendsFiltersAndParsesPeople()
    {
        var handler = new FakeHandler(FakeHandler.Json("""[{"id":"shq_1","fullName":"Amina Farah","career":{"title":"Nurse","company":null},"personality":{"mbti":"INFJ"}}]"""));
        using var api = Client(handler);
        var people = await api.RandomAsync(new RandomParams { Count = 2, Seed = 7, MinAge = 30, Tier = ["warm"] });
        Assert.Equal($"{Base}/personas/random?count=2&seed=7&minAge=30&tier=warm", handler.Calls[0]);
        Assert.Equal("Amina Farah", people[0].FullName);
        Assert.Equal("Nurse", people[0].Career.Title);
        Assert.Null(people[0].Career.Company);
        Assert.Equal("INFJ", people[0].Extra["personality"].GetProperty("mbti").GetString());
    }

    [Fact]
    public async Task PersonPassesFieldsAsCommaList()
    {
        var handler = new FakeHandler(FakeHandler.Json("""{"id":"shq_1"}"""));
        using var api = Client(handler);
        await api.PersonAsync("shq_1", ["fullName", "career"]);
        Assert.Equal($"{Base}/personas/shq_1?fields=fullName%2Ccareer", handler.Calls[0]);
    }

    [Fact]
    public async Task ErrorsCarryStatusAndApiMessage()
    {
        using var api = Client(new FakeHandler(FakeHandler.Json("""{"error":"No such person"}""", 404)));
        var e = await Assert.ThrowsAsync<ShaqsiyadException>(() => api.PersonAsync("nobody"));
        Assert.Equal(404, e.Status);
        Assert.Equal("No such person", e.ApiMessage);
    }

    [Fact]
    public async Task NetworkErrorsHaveStatusZero()
    {
        using var api = Client(new FakeHandler(FakeHandler.Throws(new HttpRequestException("connection refused"))));
        var e = await Assert.ThrowsAsync<ShaqsiyadException>(() => api.StatsAsync());
        Assert.Equal(0, e.Status);
        Assert.Contains("connection refused", e.Message);
    }

    [Fact]
    public async Task TimeoutsHaveStatusZero()
    {
        var slow = new SlowHandler();
        using var api = new ShaqsiyadClient(new ShaqsiyadOptions { BaseUrl = Base, Handler = slow, Timeout = TimeSpan.FromMilliseconds(50) });
        var e = await Assert.ThrowsAsync<ShaqsiyadException>(() => api.StatsAsync());
        Assert.Equal(0, e.Status);
        Assert.Contains("Timed out", e.Message);
    }

    [Fact]
    public async Task Retries429AfterRetryAfterThenSucceeds()
    {
        var handler = new FakeHandler(FakeHandler.Json("""{"error":"slow down"}""", 429, "0.25"), FakeHandler.Json("""{"total":3}"""));
        using var api = Client(handler);
        var stats = await api.StatsAsync();
        Assert.Equal(3, stats["total"].GetInt32());
        Assert.Equal(2, handler.Calls.Count);
        Assert.Equal([TimeSpan.FromSeconds(0.25)], _waits);
    }

    [Fact]
    public async Task GivesUpAfterConfiguredRetries()
    {
        var handler = new FakeHandler(FakeHandler.Json("""{"error":"down"}""", 503, "0"));
        using var api = Client(handler, retries: 2);
        var e = await Assert.ThrowsAsync<ShaqsiyadException>(() => api.StatsAsync());
        Assert.Equal(503, e.Status);
        Assert.Equal(3, handler.Calls.Count);
    }

    [Fact]
    public async Task BacksOffWithoutRetryAfter()
    {
        var handler = new FakeHandler(FakeHandler.Json("{}", 500), FakeHandler.Json("{}", 500), FakeHandler.Json("""{"total":1}"""));
        using var api = Client(handler, retries: 2);
        await api.StatsAsync();
        Assert.Equal([TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2)], _waits);
    }

    [Fact]
    public async Task DoesNotRetryOtherClientErrors()
    {
        var handler = new FakeHandler(FakeHandler.Json("""{"error":"bad"}""", 400));
        using var api = Client(handler);
        await Assert.ThrowsAsync<ShaqsiyadException>(() => api.StatsAsync());
        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task SearchAllWalksEveryPageAndHonoursMax()
    {
        var handler = new FakeHandler(FakeHandler.Json(Page(1, 3, "a", "b")), FakeHandler.Json(Page(2, 3, "c", "d")), FakeHandler.Json(Page(3, 3, "e")));
        using var api = Client(handler);
        var ids = new List<string>();
        await foreach (var p in api.SearchAllAsync(new SearchParams { Q = "nurse", Limit = 2 })) ids.Add(p.Id);
        Assert.Equal(["a", "b", "c", "d", "e"], ids);
        Assert.Contains("page=3", handler.Calls[2]);
        Assert.Contains("limit=2", handler.Calls[0]);

        var handler2 = new FakeHandler(FakeHandler.Json(Page(1, 3, "a", "b")), FakeHandler.Json(Page(2, 3, "c", "d")));
        using var api2 = Client(handler2);
        var few = new List<string>();
        await foreach (var p in api2.SearchAllAsync(max: 3)) few.Add(p.Id);
        Assert.Equal(["a", "b", "c"], few);
        Assert.Contains("limit=100", handler2.Calls[0]);
        Assert.Equal(2, handler2.Calls.Count);
    }

    [Fact]
    public async Task ExportReturnsRawTextForEachKind()
    {
        var handler = new FakeHandler(FakeHandler.Json("id,name\n1,A\n"));
        using var api = Client(handler);
        Assert.Equal("id,name\n1,A\n", await api.ExportAsync("random", "csv", new Query().Set("count", 1)));
        await api.ExportAsync("fixtures", "ndjson", new Query().Set("shape", "users"));
        Assert.Equal($"{Base}/personas/random?count=1&format=csv", handler.Calls[0]);
        Assert.Equal($"{Base}/fixtures?shape=users&format=ndjson", handler.Calls[1]);
        await Assert.ThrowsAsync<ArgumentException>(() => api.ExportAsync("nope", "csv"));
        await Assert.ThrowsAsync<ArgumentException>(() => api.ExportAsync("random", "xml"));
    }

    [Fact]
    public async Task FixturesTeamsHouseholdsAndGraphs()
    {
        var handler = new FakeHandler(
            FakeHandler.Json("""[{"id":"shq_1","email":"a@example.com"}]"""),
            FakeHandler.Json("""{"industry":"Healthcare","manager":{"id":"m"},"members":[{"id":"x"}]}"""),
            FakeHandler.Json("""[{"head":{"id":"h"},"partner":null,"children":[{"name":"Ayan","age":4}],"size":2}]"""),
            FakeHandler.Json("""{"nodes":[{"id":"a"}],"edges":[{"source":"a","target":"b","kind":"workplace","year":2019}]}"""));
        using var api = Client(handler);

        var users = await api.FixturesAsync("users", new FixtureParams { Count = 1, Seed = 1, Country = "Kenya" });
        Assert.Equal("a@example.com", users[0]["email"].GetString());
        Assert.Equal($"{Base}/fixtures?shape=users&count=1&seed=1&country=Kenya", handler.Calls[0]);

        var team = await api.TeamAsync(new TeamParams { Size = 6, Industry = "Healthcare", Seed = 3 });
        Assert.Equal("m", team.Manager.Id);
        Assert.Equal($"{Base}/teams?size=6&industry=Healthcare&seed=3", handler.Calls[1]);

        var households = await api.HouseholdsAsync(new RandomParams { Count = 1 });
        Assert.Equal("Ayan", households[0].Children[0].Name);

        var graph = await api.GraphAsync("shq_1", 2);
        Assert.Equal("workplace", graph.Edges[0].Kind);
        Assert.Equal($"{Base}/personas/shq_1/graph?depth=2", handler.Calls[3]);
    }

    [Fact]
    public void BaseUrlFallsBackToDefault()
    {
        var old = Environment.GetEnvironmentVariable("SHAQSIYAD_BASE_URL");
        try
        {
            Environment.SetEnvironmentVariable("SHAQSIYAD_BASE_URL", null);
            using var api = new ShaqsiyadClient();
            Assert.Equal(ShaqsiyadClient.DefaultBaseUrl, api.BaseUrl);
            Environment.SetEnvironmentVariable("SHAQSIYAD_BASE_URL", "http://localhost:8000/api/v1/");
            using var local = new ShaqsiyadClient();
            Assert.Equal("http://localhost:8000/api/v1", local.BaseUrl);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHAQSIYAD_BASE_URL", old);
        }
    }
}

internal sealed class SlowHandler : HttpMessageHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromSeconds(10), ct);
        return new HttpResponseMessage(HttpStatusCode.OK);
    }
}
