using System;
using System.IO;

namespace Jukebox.Launcher.Server;

public static class ServerInstallationFactory
{
    public static IServerInstallation Create()
    {
        return new ServerInstallation(DefaultInstallDirectory());
    }

    public static string DefaultInstallDirectory()
    {
        if (OperatingSystem.IsWindows())
        {
            var localAppData = Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData);

            return Path.Combine(localAppData, "Jukebox", "server");
        }

        if (OperatingSystem.IsMacOS())
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

            return Path.Combine(home, "Library", "Application Support", "Jukebox", "server");
        }

        if (OperatingSystem.IsLinux())
        {
            var xdgDataHome = Environment.GetEnvironmentVariable("XDG_DATA_HOME");

            if (string.IsNullOrWhiteSpace(xdgDataHome))
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                xdgDataHome = Path.Combine(home, ".local", "share");
            }

            return Path.Combine(xdgDataHome, "Jukebox", "server");
        }

        throw new PlatformNotSupportedException(
            "Could not determine a server install directory on this platform. "
            + "Set XDG_DATA_HOME (Linux) or use Windows/macOS.");
    }
}
