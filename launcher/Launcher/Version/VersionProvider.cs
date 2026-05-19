using System.Reflection;

namespace Jukebox.Launcher;

public sealed class AssemblyVersionProvider : IVersionProvider
{
    public string Current { get; } = ResolveVersion();

    private static string ResolveVersion()
    {
        var assembly = typeof(AssemblyVersionProvider).Assembly;
        var informationalVersion = assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion;

        if (string.IsNullOrWhiteSpace(informationalVersion))
        {
            return "0.0.0-dev";
        }

        var plusIndex = informationalVersion.IndexOf('+');
        return plusIndex >= 0 ? informationalVersion[..plusIndex] : informationalVersion;
    }
}
