namespace Shaqsiyad;

/// <summary>An API or network error. <see cref="Status"/> is the HTTP status, or 0 for network errors and timeouts.</summary>
public sealed class ShaqsiyadException : Exception
{
    public int Status { get; }

    public ShaqsiyadException(int status, string message, Exception? inner = null)
        : base(status == 0 ? message : $"{status}: {message}", inner)
    {
        Status = status;
        ApiMessage = message;
    }

    /// <summary>The API's error message, without the status prefix.</summary>
    public string ApiMessage { get; }
}
