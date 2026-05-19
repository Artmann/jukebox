using System;

namespace Jukebox.Launcher.ViewModels;

public sealed class AboutViewModel
{
    public AboutViewModel(string version)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(version);

        Version = version;
    }

    public string Version { get; }

    public string VersionDisplay => $"Version {Version}";
}
