using System;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace Jukebox.Launcher.Autostart;

[SupportedOSPlatform("windows")]
public sealed class WindowsAutostartService : IAutostartService
{
    private const string DefaultRunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

    private readonly string command;
    private readonly string name;
    private readonly RegistryKey rootKey;
    private readonly string runKeyPath;

    public WindowsAutostartService(string name, string executablePath)
        : this(name, executablePath, Registry.CurrentUser, DefaultRunKeyPath)
    {
    }

    public WindowsAutostartService(
        string name,
        string executablePath,
        RegistryKey rootKey,
        string runKeyPath)
    {
        this.name = name;
        this.command = $"\"{executablePath}\"";
        this.rootKey = rootKey;
        this.runKeyPath = runKeyPath;
    }

    public bool IsEnabled()
    {
        using var key = rootKey.OpenSubKey(runKeyPath, writable: false);

        return key?.GetValue(name) as string == command;
    }

    public void Enable()
    {
        using var key = rootKey.CreateSubKey(runKeyPath, writable: true)
            ?? throw new InvalidOperationException(
                $@"Could not open HKCU\{runKeyPath} for writing. Autostart not configured.");

        if (key.GetValue(name) as string != command)
        {
            key.SetValue(name, command, RegistryValueKind.String);
        }
    }

    public void Disable()
    {
        using var key = rootKey.OpenSubKey(runKeyPath, writable: true);

        key?.DeleteValue(name, throwOnMissingValue: false);
    }
}
