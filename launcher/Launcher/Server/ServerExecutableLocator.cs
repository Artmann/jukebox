using System;
using System.IO;
using System.Linq;

namespace Jukebox.Launcher.Server;

public sealed class ServerExecutableLocator : IServerExecutableLocator
{
    private readonly string binaryFileName;
    private readonly IServerInstallation installation;

    public ServerExecutableLocator(IServerInstallation installation)
        : this(
            installation,
            OperatingSystem.IsWindows() ? "jukebox-media-server.exe" : "jukebox-media-server")
    {
    }

    public ServerExecutableLocator(IServerInstallation installation, string binaryFileName)
    {
        ArgumentNullException.ThrowIfNull(installation);
        ArgumentException.ThrowIfNullOrWhiteSpace(binaryFileName);

        this.installation = installation;
        this.binaryFileName = binaryFileName;
    }

    public string? Locate()
    {
        var installDirectory = installation.InstallDirectory;

        if (!Directory.Exists(installDirectory))
        {
            return null;
        }

        var rootCandidate = Path.Combine(installDirectory, binaryFileName);

        if (File.Exists(rootCandidate))
        {
            return rootCandidate;
        }

        var bundleDirectories = Directory
            .GetDirectories(installDirectory, "jukebox-media-server-*")
            .OrderBy(directory => directory, StringComparer.Ordinal);

        foreach (var bundleDirectory in bundleDirectories)
        {
            var candidate = Path.Combine(bundleDirectory, binaryFileName);

            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
