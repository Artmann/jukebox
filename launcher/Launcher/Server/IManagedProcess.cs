using System;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public interface IManagedProcess : IDisposable
{
    int Id { get; }

    void Kill();

    bool TrySignalTerminate();

    Task<int> WaitForExitAsync(CancellationToken cancellationToken);
}
