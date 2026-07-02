using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Updates;

public sealed class HttpArchiveDownloader : IArchiveDownloader
{
    private const int BufferSize = 81920;

    private readonly HttpClient httpClient;

    public HttpArchiveDownloader(HttpClient httpClient)
    {
        ArgumentNullException.ThrowIfNull(httpClient);

        this.httpClient = httpClient;
    }

    public async Task DownloadAsync(
        string url,
        string destinationFilePath,
        IProgress<double>? progress,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(url);
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationFilePath);

        var destinationDirectory = Path.GetDirectoryName(destinationFilePath);

        if (!string.IsNullOrEmpty(destinationDirectory))
        {
            Directory.CreateDirectory(destinationDirectory);
        }

        using var response = await httpClient
            .GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        var totalBytes = response.Content.Headers.ContentLength;

        await using var source = await response.Content
            .ReadAsStreamAsync(cancellationToken)
            .ConfigureAwait(false);

        await using var destination = new FileStream(
            destinationFilePath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            BufferSize,
            useAsync: true);

        var buffer = new byte[BufferSize];
        long downloaded = 0;
        int read;

        while ((read = await source.ReadAsync(buffer, cancellationToken).ConfigureAwait(false)) > 0)
        {
            await destination
                .WriteAsync(buffer.AsMemory(0, read), cancellationToken)
                .ConfigureAwait(false);

            downloaded += read;

            if (progress is not null && totalBytes is > 0)
            {
                progress.Report((double)downloaded / totalBytes.Value);
            }
        }

        if (totalBytes is > 0 && downloaded != totalBytes.Value)
        {
            throw new IOException(
                $"Download of {url} ended early: got {downloaded} of {totalBytes.Value} bytes.");
        }
    }
}
