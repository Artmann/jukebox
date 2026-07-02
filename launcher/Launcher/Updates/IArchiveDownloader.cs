using System;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Updates;

public interface IArchiveDownloader
{
    Task DownloadAsync(
        string url,
        string destinationFilePath,
        IProgress<double>? progress,
        CancellationToken cancellationToken);
}
