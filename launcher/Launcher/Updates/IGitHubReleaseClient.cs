using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Updates;

public interface IGitHubReleaseClient
{
    Task<LatestRelease?> GetLatestServerReleaseAsync(CancellationToken cancellationToken);
}
