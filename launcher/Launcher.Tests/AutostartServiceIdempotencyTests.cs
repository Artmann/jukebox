using System;
using System.IO;
using Jukebox.Launcher.Autostart;
using Microsoft.Win32;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AutostartServiceIdempotencyTests
{
    [Fact]
    public void MacService_EnableIsIdempotent()
    {
        using var workspace = new TempDirectory();
        var executablePath = "/usr/local/bin/JukeboxLauncher";
        var service = new MacAutostartService(
            "com.jukebox.launcher.test",
            executablePath,
            workspace.Path);

        Assert.False(service.IsEnabled());

        service.Enable();
        Assert.True(service.IsEnabled());
        var firstContents = File.ReadAllBytes(service.PlistPath);

        service.Enable();
        var secondContents = File.ReadAllBytes(service.PlistPath);
        Assert.Equal(firstContents, secondContents);

        service.Disable();
        Assert.False(service.IsEnabled());
        Assert.False(File.Exists(service.PlistPath));

        service.Disable();
    }

    [Fact]
    public void LinuxService_EnableIsIdempotent()
    {
        using var workspace = new TempDirectory();
        var service = new LinuxAutostartService(
            "jukebox-launcher-test",
            "/usr/local/bin/JukeboxLauncher",
            workspace.Path);

        Assert.False(service.IsEnabled());

        service.Enable();
        Assert.True(service.IsEnabled());
        var firstContents = File.ReadAllBytes(service.DesktopFilePath);

        service.Enable();
        var secondContents = File.ReadAllBytes(service.DesktopFilePath);
        Assert.Equal(firstContents, secondContents);

        service.Disable();
        Assert.False(service.IsEnabled());

        service.Disable();
    }

    [Fact]
    public void LinuxService_ExecValueQuotesPathsWithSpaces()
    {
        using var workspace = new TempDirectory();
        var executablePath = "/home/john doe/jukebox/JukeboxLauncher";
        var service = new LinuxAutostartService(
            "jukebox-launcher-test",
            executablePath,
            workspace.Path);

        service.Enable();

        var contents = File.ReadAllText(service.DesktopFilePath);
        Assert.Contains($"Exec=\"{executablePath}\"", contents);
    }

    [Fact]
    public void WindowsService_EnableIsIdempotent()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var subKey = $@"Software\JukeboxLauncherTests\{Guid.NewGuid():N}\Run";
        var cleanupRoot = $@"Software\JukeboxLauncherTests\{ExtractGuid(subKey)}";
        var executablePath = @"C:\Program Files\Jukebox\JukeboxLauncher.exe";
        var service = new WindowsAutostartService(
            "JukeboxLauncherTest",
            executablePath,
            Registry.CurrentUser,
            subKey);

        try
        {
            Assert.False(service.IsEnabled());

            service.Enable();
            Assert.True(service.IsEnabled());

            using (var key = Registry.CurrentUser.OpenSubKey(subKey))
            {
                Assert.NotNull(key);
                Assert.Equal($"\"{executablePath}\"", key!.GetValue("JukeboxLauncherTest"));
            }

            service.Enable();
            Assert.True(service.IsEnabled());

            service.Disable();
            Assert.False(service.IsEnabled());

            service.Disable();
        }
        finally
        {
            Registry.CurrentUser.DeleteSubKeyTree(cleanupRoot, throwOnMissingSubKey: false);
        }
    }

    private static string ExtractGuid(string subKey)
    {
        var parts = subKey.Split('\\');
        return parts[^2];
    }
}
