using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public interface IServerUpdater
{
    Task<ServerUpdateResult> UpdateIfNewerAsync(CancellationToken cancellationToken);
}
