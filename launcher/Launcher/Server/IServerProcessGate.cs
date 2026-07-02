using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public interface IServerProcessGate
{
    Task StartAfterUpdateAsync(CancellationToken cancellationToken);

    Task StopForUpdateAsync(CancellationToken cancellationToken);
}
