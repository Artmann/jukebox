using System;
using System.IO;

namespace Jukebox.Launcher.Autostart;

public sealed class LinuxAutostartService : IAutostartService
{
    private readonly string applicationName;
    private readonly string autostartDirectory;
    private readonly string executablePath;

    public LinuxAutostartService(string applicationName, string executablePath)
        : this(applicationName, executablePath, DefaultAutostartDirectory())
    {
    }

    public LinuxAutostartService(
        string applicationName,
        string executablePath,
        string autostartDirectory)
    {
        this.applicationName = applicationName;
        this.executablePath = executablePath;
        this.autostartDirectory = autostartDirectory;
    }

    public string DesktopFilePath
        => Path.Combine(autostartDirectory, $"{applicationName.ToLowerInvariant()}.desktop");

    public bool IsEnabled()
    {
        if (!File.Exists(DesktopFilePath))
        {
            return false;
        }

        return File.ReadAllText(DesktopFilePath) == BuildDesktopFileContents();
    }

    public void Enable()
    {
        Directory.CreateDirectory(autostartDirectory);

        var desiredContents = BuildDesktopFileContents();

        if (File.Exists(DesktopFilePath) && File.ReadAllText(DesktopFilePath) == desiredContents)
        {
            return;
        }

        File.WriteAllText(DesktopFilePath, desiredContents);
    }

    public void Disable()
    {
        if (File.Exists(DesktopFilePath))
        {
            File.Delete(DesktopFilePath);
        }
    }

    private string BuildDesktopFileContents()
        => $"""
            [Desktop Entry]
            Type=Application
            Name=Jukebox
            Exec={executablePath}
            X-GNOME-Autostart-enabled=true
            Terminal=false

            """;

    private static string DefaultAutostartDirectory()
    {
        var configHome = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");

        if (string.IsNullOrWhiteSpace(configHome))
        {
            configHome = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".config");
        }

        return Path.Combine(configHome, "autostart");
    }
}
