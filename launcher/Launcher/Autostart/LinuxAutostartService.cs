using System;
using System.IO;
using System.Text;

namespace Jukebox.Launcher.Autostart;

public sealed class LinuxAutostartService : IAutostartService
{
    private readonly string desktopFileSlug;
    private readonly string autostartDirectory;
    private readonly string executablePath;

    public LinuxAutostartService(string desktopFileSlug, string executablePath)
        : this(desktopFileSlug, executablePath, DefaultAutostartDirectory())
    {
    }

    public LinuxAutostartService(
        string desktopFileSlug,
        string executablePath,
        string autostartDirectory)
    {
        this.desktopFileSlug = desktopFileSlug;
        this.executablePath = executablePath;
        this.autostartDirectory = autostartDirectory;
    }

    public string DesktopFilePath
        => Path.Combine(autostartDirectory, $"{desktopFileSlug}.desktop");

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
            Exec={QuoteForExec(executablePath)}
            X-GNOME-Autostart-enabled=true
            Terminal=false

            """;

    // Per the Desktop Entry Specification, the Exec key uses a shell-like
    // quoting model. Reserved characters (space, tab, newline, " ' \ > < ~
    // | & ; $ * ? # ( ) `) must be quoted; inside double quotes, the
    // characters " ` $ and \ must additionally be escaped with a backslash.
    private static string QuoteForExec(string value)
    {
        var builder = new StringBuilder(value.Length + 2);

        builder.Append('"');

        foreach (var character in value)
        {
            if (character is '"' or '\\' or '$' or '`')
            {
                builder.Append('\\');
            }

            builder.Append(character);
        }

        builder.Append('"');

        return builder.ToString();
    }

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
