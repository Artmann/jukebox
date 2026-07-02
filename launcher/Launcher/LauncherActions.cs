using System;
using Avalonia.Controls.ApplicationLifetimes;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;
using Jukebox.Launcher.ViewModels;
using Jukebox.Launcher.Views;

namespace Jukebox.Launcher;

public sealed class LauncherActions
{
    private readonly IClassicDesktopStyleApplicationLifetime lifetime;
    private readonly IServerProcessManager? processManager;
    private readonly IServerInstallation? serverInstallation;
    private readonly IUpdateStatusBus? statusBus;
    private readonly IVersionProvider versionProvider;

    public LauncherActions(
        IClassicDesktopStyleApplicationLifetime lifetime,
        IVersionProvider versionProvider)
        : this(lifetime, versionProvider, null, null)
    {
    }

    public LauncherActions(
        IClassicDesktopStyleApplicationLifetime lifetime,
        IVersionProvider versionProvider,
        IServerInstallation? serverInstallation,
        IUpdateStatusBus? statusBus,
        IServerProcessManager? processManager = null)
    {
        this.lifetime = lifetime;
        this.versionProvider = versionProvider;
        this.serverInstallation = serverInstallation;
        this.statusBus = statusBus;
        this.processManager = processManager;
    }

    public AboutWindow ShowAbout()
    {
        var installedServer = serverInstallation?.GetInstalled();
        var latestServer = statusBus?.LatestServer;

        var window = new AboutWindow
        {
            DataContext = new AboutViewModel(
                versionProvider.Current,
                null,
                installedServer,
                latestServer,
                statusBus,
                processManager),
        };

        window.Closed += (_, _) => (window.DataContext as IDisposable)?.Dispose();

        window.Show();

        return window;
    }

    public void Quit() => lifetime.Shutdown();
}
