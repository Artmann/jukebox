using System;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public interface IServerProcessManager
{
    event EventHandler<ServerProcessStateChangedEventArgs>? StateChanged;

    ServerProcessState State { get; }

    string StateDetail { get; }

    Task StartAsync(CancellationToken cancellationToken);

    Task StopAsync(CancellationToken cancellationToken);
}
