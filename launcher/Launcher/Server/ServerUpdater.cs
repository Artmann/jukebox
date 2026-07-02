using System;
using System.IO;
using System.IO.Compression;
using System.Formats.Tar;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Jukebox.Launcher.Updates;

namespace Jukebox.Launcher.Server;

public sealed class ServerUpdater : IServerUpdater
{
    private readonly IArchiveDownloader downloader;
    private readonly IServerInstallation installation;
    private readonly IPlatformAssetSelector platformSelector;
    private readonly IGitHubReleaseClient releaseClient;
    private readonly IUpdateStatusBus statusBus;
    private readonly Func<DateTimeOffset> nowProvider;

    public ServerUpdater(
        IGitHubReleaseClient releaseClient,
        IPlatformAssetSelector platformSelector,
        IServerInstallation installation,
        IArchiveDownloader downloader,
        IUpdateStatusBus statusBus)
        : this(releaseClient, platformSelector, installation, downloader, statusBus, () => DateTimeOffset.UtcNow)
    {
    }

    public ServerUpdater(
        IGitHubReleaseClient releaseClient,
        IPlatformAssetSelector platformSelector,
        IServerInstallation installation,
        IArchiveDownloader downloader,
        IUpdateStatusBus statusBus,
        Func<DateTimeOffset> nowProvider)
    {
        ArgumentNullException.ThrowIfNull(releaseClient);
        ArgumentNullException.ThrowIfNull(platformSelector);
        ArgumentNullException.ThrowIfNull(installation);
        ArgumentNullException.ThrowIfNull(downloader);
        ArgumentNullException.ThrowIfNull(statusBus);
        ArgumentNullException.ThrowIfNull(nowProvider);

        this.releaseClient = releaseClient;
        this.platformSelector = platformSelector;
        this.installation = installation;
        this.downloader = downloader;
        this.statusBus = statusBus;
        this.nowProvider = nowProvider;
    }

    public async Task<ServerUpdateResult> UpdateIfNewerAsync(CancellationToken cancellationToken)
    {
        statusBus.Publish("Checking for updates…");

        LatestRelease? latest;

        try
        {
            latest = await releaseClient
                .GetLatestServerReleaseAsync(cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            var message = "Couldn't reach GitHub. We'll try again next launch.";
            statusBus.Publish(message);
            return new ServerUpdateResult(ServerUpdateOutcome.NoNetwork, null, message);
        }

        if (latest is null)
        {
            var message = "No server releases found on GitHub.";
            statusBus.Publish(message);
            return new ServerUpdateResult(ServerUpdateOutcome.Failed, null, message);
        }

        statusBus.SetLatestServer(latest);

        var asset = platformSelector.SelectAsset(latest);

        if (asset is null)
        {
            var message = $"No server build available for this platform ({platformSelector.PlatformDescription}).";
            statusBus.Publish(message);
            return new ServerUpdateResult(ServerUpdateOutcome.NoAssetForPlatform, latest.Version, message);
        }

        var installed = installation.GetInstalled();

        if (installed is not null && !SemVerComparer.IsNewer(latest.Version, installed.Version))
        {
            var message = $"Server is up to date ({installed.Version}).";
            statusBus.Publish(message);
            return new ServerUpdateResult(ServerUpdateOutcome.UpToDate, installed.Version, message);
        }

        var actionVerb = installed is null ? "Installing" : "Downloading";
        statusBus.Publish($"{actionVerb} server {latest.Version}…");

        try
        {
            await InstallAsync(latest, asset, installed is null, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception error)
        {
            var message = installed is null
                ? $"Server install failed: {error.Message}."
                : $"Server install failed: {error.Message}. Previous version kept.";

            statusBus.Publish(message);
            return new ServerUpdateResult(ServerUpdateOutcome.Failed, latest.Version, message);
        }

        var doneMessage = installed is null
            ? $"Server installed at {latest.Version}."
            : $"Server updated to {latest.Version}.";

        statusBus.Publish(doneMessage);
        return new ServerUpdateResult(ServerUpdateOutcome.Updated, latest.Version, doneMessage);
    }

    private async Task InstallAsync(
        LatestRelease latest,
        ReleaseAsset asset,
        bool firstInstall,
        CancellationToken cancellationToken)
    {
        var installDirectory = installation.InstallDirectory;
        var parent = Path.GetDirectoryName(installDirectory)
            ?? throw new InvalidOperationException(
                $"Install directory has no parent: {installDirectory}.");

        Directory.CreateDirectory(parent);

        var downloadDirectory = installDirectory + ".download";
        var newDirectory = installDirectory + ".new";
        var oldDirectory = installDirectory + ".old";

        CleanDirectory(downloadDirectory);
        CleanDirectory(newDirectory);
        CleanDirectory(oldDirectory);

        Directory.CreateDirectory(downloadDirectory);

        var archivePath = Path.Combine(downloadDirectory, asset.Name);
        var verbForProgress = firstInstall ? "Installing" : "Downloading";
        var progress = new Progress<double>(fraction =>
        {
            var percent = (int)Math.Round(fraction * 100);
            statusBus.Publish($"{verbForProgress} server {latest.Version}… {percent}%");
        });

        await downloader
            .DownloadAsync(asset.DownloadUrl, archivePath, progress, cancellationToken)
            .ConfigureAwait(false);

        statusBus.Publish($"Extracting server {latest.Version}…");

        Directory.CreateDirectory(newDirectory);
        ExtractArchive(archivePath, newDirectory);

        if (Directory.Exists(installDirectory))
        {
            Directory.Move(installDirectory, oldDirectory);
        }

        try
        {
            Directory.Move(newDirectory, installDirectory);
        }
        catch
        {
            if (Directory.Exists(oldDirectory))
            {
                TryRestore(oldDirectory, installDirectory);
            }

            throw;
        }

        installation.WriteInstalled(
            new InstalledServer(latest.Version, latest.Tag, nowProvider()));

        CleanDirectory(oldDirectory);
        CleanDirectory(downloadDirectory);
    }

    private static void ExtractArchive(string archivePath, string destinationDirectory)
    {
        if (archivePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
        {
            ZipFile.ExtractToDirectory(archivePath, destinationDirectory, overwriteFiles: true);
            return;
        }

        if (archivePath.EndsWith(".tar.gz", StringComparison.OrdinalIgnoreCase)
            || archivePath.EndsWith(".tgz", StringComparison.OrdinalIgnoreCase))
        {
            using var fileStream = File.OpenRead(archivePath);
            using var gzip = new GZipStream(fileStream, CompressionMode.Decompress);

            TarFile.ExtractToDirectory(gzip, destinationDirectory, overwriteFiles: true);
            return;
        }

        throw new NotSupportedException(
            $"Unsupported archive format: {Path.GetFileName(archivePath)}. Expected .zip or .tar.gz.");
    }

    private static void CleanDirectory(string path)
    {
        if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }
    }

    private static void TryRestore(string from, string to)
    {
        try
        {
            Directory.Move(from, to);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(
                $"Could not restore previous server install from {from} to {to}: {error.Message}");
        }
    }
}
