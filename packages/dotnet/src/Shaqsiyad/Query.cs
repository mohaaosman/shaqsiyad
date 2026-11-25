using System.Globalization;
using System.Text;

namespace Shaqsiyad;

/// <summary>Ordered query parameters. Null and empty values are dropped; repeated keys are kept.</summary>
public sealed class Query
{
    private readonly List<KeyValuePair<string, string>> _pairs = [];

    public IReadOnlyList<KeyValuePair<string, string>> Pairs => _pairs;

    public Query Set(string key, string? value)
    {
        _pairs.RemoveAll(p => p.Key == key);
        if (!string.IsNullOrEmpty(value)) _pairs.Add(new(key, value));
        return this;
    }

    public Query Set(string key, int? value) => Set(key, value?.ToString(CultureInfo.InvariantCulture));

    public Query Add(string key, string? value)
    {
        if (!string.IsNullOrEmpty(value)) _pairs.Add(new(key, value));
        return this;
    }

    public Query AddAll(string key, IEnumerable<string>? values)
    {
        if (values is not null) foreach (var v in values) Add(key, v);
        return this;
    }

    public override string ToString()
    {
        var sb = new StringBuilder();
        foreach (var (k, v) in _pairs)
        {
            if (sb.Length > 0) sb.Append('&');
            sb.Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(v));
        }
        return sb.ToString();
    }
}
