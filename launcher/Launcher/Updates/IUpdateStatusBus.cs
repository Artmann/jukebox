using System;

namespace Jukebox.Launcher.Updates;

public interface IUpdateStatusBus
{
    string Status { get; }

    LatestRelease? LatestServer { get; }

    event EventHandler<UpdateStatusChangedEventArgs>? StatusChanged;

    event EventHandler<LatestServerChangedEventArgs>? LatestServerChanged;

    void Publish(string status);

    void SetLatestServer(LatestRelease release);
}

public sealed class UpdateStatusChangedEventArgs : EventArgs
{
    public UpdateStatusChangedEventArgs(string status)
    {
        Status = status;
    }

    public string Status { get; }
}

public sealed class LatestServerChangedEventArgs : EventArgs
{
    public LatestServerChangedEventArgs(LatestRelease latest)
    {
        Latest = latest;
    }

    public LatestRelease Latest { get; }
}
