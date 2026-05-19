using System;

namespace Jukebox.Launcher.Autostart;

public static class AutostartServiceFactory
{
    public const string AppName = "JukeboxLauncher";
    public const string BundleId = "com.jukebox.launcher";

    public static IAutostartService Create()
    {
        var executablePath = Environment.ProcessPath
            ?? throw new InvalidOperationException(
                "Could not determine the launcher executable path. Autostart cannot be configured.");

        if (OperatingSystem.IsWindows())
        {
            return new WindowsAutostartService(AppName, executablePath);
        }

        if (OperatingSystem.IsMacOS())
        {
            return new MacAutostartService(BundleId, executablePath);
        }

        if (OperatingSystem.IsLinux())
        {
            return new LinuxAutostartService(AppName, executablePath);
        }

        return new NoopAutostartService();
    }
}
