using System;
using System.IO;
using Jukebox.Launcher.Autostart;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AutostartServiceIdempotencyTests
{
    [Fact]
    public void MacService_EnableIsIdempotent()
    {
        if (!OperatingSystem.IsMacOS() && !OperatingSystem.IsLinux())
        {
            return;
        }

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
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
        {
            return;
        }

        using var workspace = new TempDirectory();
        var service = new LinuxAutostartService(
            "JukeboxLauncherTest",
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

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"jukebox-launcher-test-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, recursive: true);
            }
        }
    }
}
