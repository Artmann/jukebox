using System.Reflection;

namespace Jukebox.Launcher;

public static class VersionProvider
{
    public static string Current { get; } = ResolveVersion();

    private static string ResolveVersion()
    {
        var assembly = typeof(VersionProvider).Assembly;
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
