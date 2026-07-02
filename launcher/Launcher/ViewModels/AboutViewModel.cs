using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Avalonia.Threading;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;

namespace Jukebox.Launcher.ViewModels;

public sealed class AboutViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly IServerProcessManager? processManager;
    private readonly IUpdateStatusBus? statusBus;

    private string serverInstalled;
    private string serverLatest;
    private string serverState;
    private string status;
    private string launcherLatest;

    public AboutViewModel(string launcherInstalled)
        : this(launcherInstalled, null, null, null, null)
    {
    }

    public AboutViewModel(
        string launcherInstalled,
        string? launcherLatest,
        InstalledServer? installedServer,
        LatestRelease? latestServer,
        IUpdateStatusBus? statusBus,
        IServerProcessManager? processManager = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(launcherInstalled);

        LauncherInstalled = launcherInstalled;
        this.launcherLatest = FormatLauncherLatest(launcherLatest);
        serverInstalled = FormatServerInstalled(installedServer);
        serverLatest = FormatServerLatest(latestServer);
        serverState = processManager is null
            ? string.Empty
            : FormatServerState(processManager.State, processManager.StateDetail);
        status = statusBus?.Status ?? string.Empty;

        this.processManager = processManager;
        this.statusBus = statusBus;

        if (statusBus is not null)
        {
            statusBus.StatusChanged += OnStatusChanged;
            statusBus.LatestServerChanged += OnLatestServerChanged;
        }

        if (processManager is not null)
        {
            processManager.StateChanged += OnServerStateChanged;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string LauncherInstalled { get; }

    public string LauncherInstalledDisplay => $"Launcher {LauncherInstalled}";

    public string LauncherLatestDisplay => launcherLatest;

    public string ServerInstalledDisplay => serverInstalled;

    public string ServerLatestDisplay => serverLatest;

    public string ServerStateDisplay => serverState;

    public string StatusDisplay => status;

    public string Version => LauncherInstalled;

    public string VersionDisplay => $"Version {LauncherInstalled}";

    public void Dispose()
    {
        if (statusBus is not null)
        {
            statusBus.StatusChanged -= OnStatusChanged;
            statusBus.LatestServerChanged -= OnLatestServerChanged;
        }

        if (processManager is not null)
        {
            processManager.StateChanged -= OnServerStateChanged;
        }
    }

    private static string FormatLauncherLatest(string? latest)
    {
        return string.IsNullOrWhiteSpace(latest) ? string.Empty : $"latest {latest}";
    }

    private static string FormatServerInstalled(InstalledServer? installed)
    {
        return installed is null ? "Server not installed" : $"Server {installed.Version}";
    }

    private static string FormatServerLatest(LatestRelease? latest)
    {
        return latest is null ? string.Empty : $"latest {latest.Version}";
    }

    private static string FormatServerState(ServerProcessState state, string detail)
    {
        return state switch
        {
            ServerProcessState.Failed => detail,
            ServerProcessState.NotInstalled => string.Empty,
            ServerProcessState.Restarting => "Server restarting…",
            ServerProcessState.Running => "Server running",
            ServerProcessState.Starting => "Server starting…",
            ServerProcessState.Stopped => "Server stopped",
            _ => string.Empty,
        };
    }

    private void OnLatestServerChanged(object? sender, LatestServerChangedEventArgs eventArguments)
    {
        var formattedServer = FormatServerLatest(eventArguments.Latest);

        RunOnUiThread(() =>
        {
            serverLatest = formattedServer;
            RaisePropertyChanged(nameof(ServerLatestDisplay));
        });
    }

    private void OnServerStateChanged(object? sender, ServerProcessStateChangedEventArgs eventArguments)
    {
        var formattedState = FormatServerState(eventArguments.State, eventArguments.Detail);

        RunOnUiThread(() =>
        {
            serverState = formattedState;
            RaisePropertyChanged(nameof(ServerStateDisplay));
        });
    }

    private void OnStatusChanged(object? sender, UpdateStatusChangedEventArgs eventArguments)
    {
        var newStatus = eventArguments.Status;

        RunOnUiThread(() =>
        {
            status = newStatus;
            RaisePropertyChanged(nameof(StatusDisplay));
        });
    }

    private void RaisePropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    private static void RunOnUiThread(Action action)
    {
        if (Dispatcher.UIThread.CheckAccess())
        {
            action();
            return;
        }

        Dispatcher.UIThread.Post(action);
    }
}
