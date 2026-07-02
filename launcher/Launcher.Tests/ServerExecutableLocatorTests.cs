using System.IO;
using Jukebox.Launcher.Server;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class ServerExecutableLocatorTests
{
    [Fact]
    public void FindsBinaryInTargetNamedSubdirectory()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");
        var bundleDirectory = Path.Combine(installDirectory, "jukebox-media-server-windows-x64");

        Directory.CreateDirectory(bundleDirectory);
        var binaryPath = Path.Combine(bundleDirectory, "jukebox-media-server.exe");
        File.WriteAllText(binaryPath, "binary");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server.exe");

        Assert.Equal(binaryPath, locator.Locate());
    }

    [Fact]
    public void FindsBinaryAtInstallRoot()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");

        Directory.CreateDirectory(installDirectory);
        var binaryPath = Path.Combine(installDirectory, "jukebox-media-server");
        File.WriteAllText(binaryPath, "binary");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server");

        Assert.Equal(binaryPath, locator.Locate());
    }

    [Fact]
    public void ReturnsNullWhenInstallDirectoryMissing()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "does-not-exist");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server");

        Assert.Null(locator.Locate());
    }

    [Fact]
    public void ReturnsNullWhenBinaryAbsent()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");

        Directory.CreateDirectory(Path.Combine(installDirectory, "jukebox-media-server-windows-x64"));

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server.exe");

        Assert.Null(locator.Locate());
    }

    [Fact]
    public void IgnoresUnrelatedSubdirectories()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");
        var unrelated = Path.Combine(installDirectory, "other-folder");

        Directory.CreateDirectory(unrelated);
        File.WriteAllText(Path.Combine(unrelated, "jukebox-media-server"), "binary");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server");

        Assert.Null(locator.Locate());
    }
}
