using System;

namespace Jukebox.Launcher.Server;

public sealed class ServerProcessStateChangedEventArgs : EventArgs
{
    public ServerProcessStateChangedEventArgs(ServerProcessState state, string detail)
    {
        State = state;
        Detail = detail;
    }

    public string Detail { get; }

    public ServerProcessState State { get; }
}
