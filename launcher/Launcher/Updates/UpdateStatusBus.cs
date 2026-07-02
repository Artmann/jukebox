using System;

namespace Jukebox.Launcher.Updates;

public sealed class UpdateStatusBus : IUpdateStatusBus
{
    private readonly object lockObject = new();

    private LatestRelease? latestServer;
    private string status = string.Empty;

    public string Status
    {
        get
        {
            lock (lockObject)
            {
                return status;
            }
        }
    }

    public LatestRelease? LatestServer
    {
        get
        {
            lock (lockObject)
            {
                return latestServer;
            }
        }
    }

    public event EventHandler<UpdateStatusChangedEventArgs>? StatusChanged;

    public event EventHandler<LatestServerChangedEventArgs>? LatestServerChanged;

    public void Publish(string status)
    {
        ArgumentNullException.ThrowIfNull(status);

        lock (lockObject)
        {
            this.status = status;
        }

        StatusChanged?.Invoke(this, new UpdateStatusChangedEventArgs(status));
    }

    public void SetLatestServer(LatestRelease release)
    {
        ArgumentNullException.ThrowIfNull(release);

        lock (lockObject)
        {
            latestServer = release;
        }

        LatestServerChanged?.Invoke(this, new LatestServerChangedEventArgs(release));
    }
}
