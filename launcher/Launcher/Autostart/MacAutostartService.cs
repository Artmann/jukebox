using System;
using System.IO;

namespace Jukebox.Launcher.Autostart;

public sealed class MacAutostartService : IAutostartService
{
    private readonly string bundleId;
    private readonly string executablePath;
    private readonly string launchAgentsDirectory;

    public MacAutostartService(string bundleId, string executablePath)
        : this(bundleId, executablePath, DefaultLaunchAgentsDirectory())
    {
    }

    public MacAutostartService(string bundleId, string executablePath, string launchAgentsDirectory)
    {
        this.bundleId = bundleId;
        this.executablePath = executablePath;
        this.launchAgentsDirectory = launchAgentsDirectory;
    }

    public string PlistPath => Path.Combine(launchAgentsDirectory, $"{bundleId}.plist");

    public bool IsEnabled()
    {
        if (!File.Exists(PlistPath))
        {
            return false;
        }

        return File.ReadAllText(PlistPath) == BuildPlistContents();
    }

    public void Enable()
    {
        Directory.CreateDirectory(launchAgentsDirectory);

        var desiredContents = BuildPlistContents();

        if (File.Exists(PlistPath) && File.ReadAllText(PlistPath) == desiredContents)
        {
            return;
        }

        File.WriteAllText(PlistPath, desiredContents);
    }

    public void Disable()
    {
        if (File.Exists(PlistPath))
        {
            File.Delete(PlistPath);
        }
    }

    private string BuildPlistContents()
        => $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
            <dict>
                <key>Label</key>
                <string>{bundleId}</string>
                <key>ProgramArguments</key>
                <array>
                    <string>{executablePath}</string>
                </array>
                <key>RunAtLoad</key>
                <true/>
                <key>KeepAlive</key>
                <false/>
            </dict>
            </plist>

            """;

    private static string DefaultLaunchAgentsDirectory()
        => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Library",
            "LaunchAgents");
}
