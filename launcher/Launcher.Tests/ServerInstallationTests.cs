using System;
using System.IO;
using Jukebox.Launcher.Server;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class ServerInstallationTests
{
    [Fact]
    public void GetInstalledReturnsNullWhenFileMissing()
    {
        using var workspace = new TempDirectory();
        var installation = new ServerInstallation(workspace.Path);

        Assert.Null(installation.GetInstalled());
    }

    [Fact]
    public void GetInstalledReadsVersionFile()
    {
        using var workspace = new TempDirectory();
        var path = Path.Combine(workspace.Path, "server-version.json");

        File.WriteAllText(
            path,
            """
            {
              "version": "0.5.1",
              "tag": "jukebox-media-server-v0.5.1",
              "installedAt": "2026-05-19T08:00:00+00:00"
            }
            """);

        var installation = new ServerInstallation(workspace.Path);
        var installed = installation.GetInstalled();

        Assert.NotNull(installed);
        Assert.Equal(
            new InstalledServer(
                "0.5.1",
                "jukebox-media-server-v0.5.1",
                new DateTimeOffset(2026, 5, 19, 8, 0, 0, TimeSpan.Zero)),
            installed);
    }

    [Fact]
    public void GetInstalledReturnsNullWhenJsonMalformed()
    {
        using var workspace = new TempDirectory();
        File.WriteAllText(Path.Combine(workspace.Path, "server-version.json"), "not json");

        var installation = new ServerInstallation(workspace.Path);

        Assert.Null(installation.GetInstalled());
    }

    [Fact]
    public void GetInstalledReturnsNullWhenVersionMissing()
    {
        using var workspace = new TempDirectory();
        File.WriteAllText(
            Path.Combine(workspace.Path, "server-version.json"),
            """{ "tag": "jukebox-media-server-v0.5.1", "installedAt": "2026-05-19T08:00:00+00:00" }""");

        var installation = new ServerInstallation(workspace.Path);

        Assert.Null(installation.GetInstalled());
    }

    [Fact]
    public void WriteInstalledCreatesDirectoryAndRoundTrips()
    {
        using var workspace = new TempDirectory();
        var path = Path.Combine(workspace.Path, "nested", "server");

        var installation = new ServerInstallation(path);
        var record = new InstalledServer(
            "0.5.2",
            "jukebox-media-server-v0.5.2",
            new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero));

        installation.WriteInstalled(record);

        Assert.True(File.Exists(Path.Combine(path, "server-version.json")));

        var round = installation.GetInstalled();

        Assert.Equal(record, round);
    }
}
