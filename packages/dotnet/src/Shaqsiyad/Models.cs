using System.Text.Json;
using System.Text.Json.Serialization;

namespace Shaqsiyad;

/// <summary>Filters that narrow down people. Null values are left out of the request.</summary>
public record Filters
{
    public string? Q { get; init; }
    /// <summary>male or female</summary>
    public string? Gender { get; init; }
    public int? MinAge { get; init; }
    public int? MaxAge { get; init; }
    public string? Continent { get; init; }
    public string? Country { get; init; }
    public string? Ethnicity { get; init; }
    public string? Religion { get; init; }
    /// <summary>radiant, luminous, warm, soft, muted — repeated in the query.</summary>
    public IReadOnlyList<string>? Tier { get; init; }
    public string? Mbti { get; init; }
    public string? Relationship { get; init; }
    public string? Industry { get; init; }
    public string? Status { get; init; }

    internal void Apply(Query q)
    {
        q.Set("q", Q).Set("gender", Gender).Set("minAge", MinAge).Set("maxAge", MaxAge)
         .Set("continent", Continent).Set("country", Country).Set("ethnicity", Ethnicity)
         .Set("religion", Religion).AddAll("tier", Tier).Set("mbti", Mbti)
         .Set("relationship", Relationship).Set("industry", Industry).Set("status", Status);
    }
}

/// <summary>Parameters for <see cref="ShaqsiyadClient.SearchAsync"/> and <see cref="ShaqsiyadClient.SearchAllAsync"/>.</summary>
public record SearchParams : Filters
{
    public string? Sort { get; init; }
    public int? Page { get; init; }
    public int? Limit { get; init; }

    internal Query ToQuery()
    {
        var q = new Query();
        Apply(q);
        return q.Set("sort", Sort).Set("page", Page).Set("limit", Limit);
    }
}

/// <summary>Parameters for random people, households and face sheets.</summary>
public record RandomParams : Filters
{
    public int? Count { get; init; }
    /// <summary>Same seed + same filters → same people.</summary>
    public int? Seed { get; init; }

    internal Query ToQuery()
    {
        var q = new Query().Set("count", Count).Set("seed", Seed);
        Apply(q);
        return q;
    }
}

/// <summary>Parameters for fixtures.</summary>
public record FixtureParams : RandomParams;

/// <summary>Parameters for teams.</summary>
public record TeamParams
{
    public int? Size { get; init; }
    public string? Industry { get; init; }
    public int? Seed { get; init; }
}

/// <summary>The short form returned by search and in graphs and teams.</summary>
public record PersonaSummary
{
    public string Id { get; init; } = "";
    public string Slug { get; init; } = "";
    public string FullName { get; init; } = "";
    public string FirstName { get; init; } = "";
    public string Gender { get; init; } = "";
    public int Age { get; init; }
    public string City { get; init; } = "";
    public string Country { get; init; } = "";
    public string Continent { get; init; } = "";
    public string Ethnicity { get; init; } = "";
    public string Religion { get; init; } = "";
    public string Branch { get; init; } = "";
    public string Title { get; init; } = "";
    public string Industry { get; init; } = "";
    public string Relationship { get; init; } = "";
    public string Mbti { get; init; } = "";
    public string Tier { get; init; } = "";
    public double Overall { get; init; }
    public string Tagline { get; init; } = "";
    public int Connections { get; init; }
    public string Initials { get; init; } = "";
    public string Avatar { get; init; } = "";
}

/// <summary>A fictional postal address.</summary>
public record Address
{
    public string Street { get; init; } = "";
    public string City { get; init; } = "";
    public string Postcode { get; init; } = "";
    public string Country { get; init; } = "";
}

public record Religion
{
    public string Name { get; init; } = "";
    public string Branch { get; init; } = "";
    public string? Observance { get; init; }
    public IReadOnlyList<string> Practices { get; init; } = [];
}

public record Contact
{
    public string Email { get; init; } = "";
    public string Phone { get; init; } = "";
    public Address Address { get; init; } = new();
}

public record AvatarInfo
{
    public string Url { get; init; } = "";
    public Dictionary<string, string> Sizes { get; init; } = new();
    public string Prompt { get; init; } = "";
    public string Initials { get; init; } = "";
}

public record Career
{
    public string Status { get; init; } = "";
    public string Title { get; init; } = "";
    public string Industry { get; init; } = "";
    public string? Company { get; init; }
}

/// <summary>One complete person. Fields not modelled here are kept in <see cref="Extra"/>.</summary>
public record Persona
{
    public string Id { get; init; } = "";
    public string Slug { get; init; } = "";
    public string FullName { get; init; } = "";
    public string FirstName { get; init; } = "";
    public string LastName { get; init; } = "";
    public string Gender { get; init; } = "";
    public int Age { get; init; }
    public string BirthDate { get; init; } = "";
    public string City { get; init; } = "";
    public string Country { get; init; } = "";
    public string Continent { get; init; } = "";
    public string Nationality { get; init; } = "";
    public string Ethnicity { get; init; } = "";
    public Religion Religion { get; init; } = new();
    public Contact Contact { get; init; } = new();
    public AvatarInfo Avatar { get; init; } = new();
    public Career Career { get; init; } = new();

    /// <summary>Every other top-level field: personality, childhood, likes, lifeEvents…</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; } = new();
}

/// <summary>One page of search results.</summary>
public record SearchResult
{
    public int Total { get; init; }
    public int Page { get; init; }
    public int Limit { get; init; }
    public int Pages { get; init; }
    public string Sort { get; init; } = "";
    public string? Matched { get; init; }
    public IReadOnlyList<PersonaSummary> Results { get; init; } = [];
}

public record Edge
{
    public string Source { get; init; } = "";
    public string Target { get; init; } = "";
    public string Kind { get; init; } = "";
    public int Year { get; init; }
}

/// <summary>A person's connections as nodes and edges.</summary>
public record Graph
{
    public IReadOnlyList<PersonaSummary> Nodes { get; init; } = [];
    public IReadOnlyList<Edge> Edges { get; init; } = [];
}

public record Child
{
    public string Name { get; init; } = "";
    public int Age { get; init; }
}

/// <summary>A person with partner and children.</summary>
public record Household
{
    public PersonaSummary Head { get; init; } = new();
    public string? Partner { get; init; }
    public IReadOnlyList<Child> Children { get; init; } = [];
    public Address Address { get; init; } = new();
    public int Size { get; init; }
}

/// <summary>A manager and reports in one industry.</summary>
public record Team
{
    public string Industry { get; init; } = "";
    public PersonaSummary Manager { get; init; } = new();
    public IReadOnlyList<PersonaSummary> Members { get; init; } = [];
}
