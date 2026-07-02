using System;
using System.Collections.Generic;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;
using Jukebox.Launcher.ViewModels;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AboutViewModelTests
{
    [Fact]
    public void ExposesLauncherInstalledAndDisplayString()
    {
        var viewModel = new AboutViewModel("1.2.3");

        Assert.Equal("1.2.3", viewModel.LauncherInstalled);
        Assert.Equal("Launcher 1.2.3", viewModel.LauncherInstalledDisplay);
        Assert.Equal("Server not installed", viewModel.ServerInstalledDisplay);
        Assert.Equal(string.Empty, viewModel.ServerLatestDisplay);
        Assert.Equal(string.Empty, viewModel.LauncherLatestDisplay);
        Assert.Equal(string.Empty, viewModel.StatusDisplay);
    }

    [Fact]
    public void SupportsPrereleaseTags()
    {
        var viewModel = new AboutViewModel("0.5.1-beta.1");

        Assert.Equal("0.5.1-beta.1", viewModel.LauncherInstalled);
        Assert.Equal("Launcher 0.5.1-beta.1", viewModel.LauncherInstalledDisplay);
    }

    [Fact]
    public void RejectsEmptyVersion()
    {
        Assert.Throws<ArgumentException>(() => new AboutViewModel(" "));
    }

    [Fact]
    public void FormatsInstalledServerAndLatestRelease()
    {
        var installed = new InstalledServer(
            "0.5.0",
            "jukebox-media-server-v0.5.0",
            DateTimeOffset.UtcNow);

        var latest = new LatestRelease(
            "jukebox-media-server-v0.5.1",
            "0.5.1",
            new List<ReleaseAsset>());

        var viewModel = new AboutViewModel("0.5.1", "0.5.1", installed, latest, null);

        Assert.Equal("Server 0.5.0", viewModel.ServerInstalledDisplay);
        Assert.Equal("latest 0.5.1", viewModel.ServerLatestDisplay);
        Assert.Equal("latest 0.5.1", viewModel.LauncherLatestDisplay);
    }

    [Fact]
    public void UpdatesStatusWhenBusPublishes()
    {
        var bus = new UpdateStatusBus();

        using var viewModel = new AboutViewModel("1.0.0", null, null, null, bus);

        var changes = new List<string>();
        viewModel.PropertyChanged += (_, eventArguments) =>
        {
            if (eventArguments.PropertyName == nameof(AboutViewModel.StatusDisplay))
            {
                changes.Add(viewModel.StatusDisplay);
            }
        };

        bus.Publish("Checking for updates…");

        Assert.Equal(new[] { "Checking for updates…" }, changes);
        Assert.Equal("Checking for updates…", viewModel.StatusDisplay);
    }

    [Fact]
    public void UpdatesServerLatestWhenBusSetsRelease()
    {
        var bus = new UpdateStatusBus();

        using var viewModel = new AboutViewModel("1.0.0", null, null, null, bus);

        var release = new LatestRelease(
            "jukebox-media-server-v2.0.0",
            "2.0.0",
            new List<ReleaseAsset>());

        bus.SetLatestServer(release);

        Assert.Equal("latest 2.0.0", viewModel.ServerLatestDisplay);
        Assert.Equal(string.Empty, viewModel.LauncherLatestDisplay);
    }

    [Fact]
    public void DisposeUnsubscribesFromBus()
    {
        var bus = new UpdateStatusBus();
        var viewModel = new AboutViewModel("1.0.0", null, null, null, bus);

        viewModel.Dispose();

        bus.Publish("After dispose");

        Assert.Equal(string.Empty, viewModel.StatusDisplay);
    }
}
