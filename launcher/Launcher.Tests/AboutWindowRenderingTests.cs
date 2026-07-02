using System;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;
using Jukebox.Launcher.ViewModels;
using Jukebox.Launcher.Views;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AboutWindowRenderingTests
{
    [AvaloniaFact]
    public void RendersTitleVersionsAndTagline()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel("1.2.3"),
        };

        window.Show();

        Assert.Equal("About Jukebox", window.Title);
        Assert.Equal("Jukebox", window.GetByTestId<TextBlock>("about-title").Text);
        Assert.Equal("Launcher 1.2.3", window.GetByTestId<TextBlock>("about-launcher-installed").Text);
        Assert.Equal(string.Empty, window.GetByTestId<TextBlock>("about-launcher-latest").Text);
        Assert.Equal("Server not installed", window.GetByTestId<TextBlock>("about-server-installed").Text);
        Assert.Equal(string.Empty, window.GetByTestId<TextBlock>("about-server-latest").Text);
        Assert.Equal(string.Empty, window.GetByTestId<TextBlock>("about-status").Text);
        Assert.Equal("Self-hosted media server", window.GetByTestId<TextBlock>("about-tagline").Text);

        window.Close();
    }

    [AvaloniaFact]
    public void RendersInstalledServerAndLatest()
    {
        var installed = new InstalledServer("0.5.0", "jukebox-media-server-v0.5.0", DateTimeOffset.UtcNow);
        var latest = new LatestRelease("jukebox-media-server-v0.5.1", "0.5.1", new List<ReleaseAsset>());

        var window = new AboutWindow
        {
            DataContext = new AboutViewModel("0.5.1", "0.5.1", installed, latest, null),
        };

        window.Show();

        Assert.Equal("Server 0.5.0", window.GetByTestId<TextBlock>("about-server-installed").Text);
        Assert.Equal("latest 0.5.1", window.GetByTestId<TextBlock>("about-server-latest").Text);
        Assert.Equal("latest 0.5.1", window.GetByTestId<TextBlock>("about-launcher-latest").Text);

        window.Close();
    }

    [AvaloniaFact]
    public void StatusLineUpdatesWhenBusPublishes()
    {
        var bus = new UpdateStatusBus();
        var viewModel = new AboutViewModel("1.0.0", null, null, null, bus);

        var window = new AboutWindow { DataContext = viewModel };

        window.Show();

        Assert.Equal(string.Empty, window.GetByTestId<TextBlock>("about-status").Text);

        bus.Publish("Downloading server 0.5.1…");
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("Downloading server 0.5.1…", window.GetByTestId<TextBlock>("about-status").Text);

        window.Close();
    }

    [AvaloniaFact]
    public void CloseButtonClosesTheWindow()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel("9.9.9"),
        };

        window.Show();

        var closeButton = window.GetByTestId<Button>("about-close");
        Assert.Equal("Close", closeButton.Content);

        var closed = false;
        window.Closed += (_, _) => closed = true;

        closeButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

        Assert.True(closed);
    }

    [AvaloniaFact]
    public void ServerStateLineUpdatesWhenManagerRaisesEvent()
    {
        var manager = new AboutViewModelTests.FakeServerProcessManager(
            ServerProcessState.Starting,
            "Server starting…");
        var viewModel = new AboutViewModel("1.0.0", null, null, null, null, manager);

        var window = new AboutWindow { DataContext = viewModel };

        window.Show();

        Assert.Equal("Server starting…", window.GetByTestId<TextBlock>("about-server-state").Text);

        manager.Raise(ServerProcessState.Running, "Server running");
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("Server running", window.GetByTestId<TextBlock>("about-server-state").Text);

        window.Close();
    }
}
