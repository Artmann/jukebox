using System;
using System.Collections.Generic;
using System.Formats.Tar;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;
using Moq;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class ServerUpdaterTests
{
    [Fact]
    public async Task InstallsServerWhenNothingPreviouslyInstalled()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");
        var fixtureArchive = BuildZipFixture(workspace.Path, "windows", "0.5.1");

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            fixtureArchive,
            out var statusBus);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Updated, result.Outcome);
        Assert.Equal("0.5.1", result.Version);
        Assert.True(File.Exists(Path.Combine(installDirectory, "fake-server.exe")));
        Assert.True(File.Exists(Path.Combine(installDirectory, "server-version.json")));
        Assert.False(Directory.Exists(installDirectory + ".old"));
        Assert.False(Directory.Exists(installDirectory + ".new"));
        Assert.False(Directory.Exists(installDirectory + ".download"));
        Assert.Equal("Server installed at 0.5.1.", statusBus.Status);
    }

    [Fact]
    public async Task ReportsUpToDateWhenInstalledMatchesLatest()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        Directory.CreateDirectory(installDirectory);
        var installation = new ServerInstallation(installDirectory);
        installation.WriteInstalled(new InstalledServer(
            "0.5.1",
            "jukebox-media-server-v0.5.1",
            DateTimeOffset.UtcNow));

        var downloader = new Mock<IArchiveDownloader>(MockBehavior.Strict);

        var releaseClient = new Mock<IGitHubReleaseClient>();
        releaseClient
            .Setup(target => target.GetLatestServerReleaseAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"));

        var statusBus = new UpdateStatusBus();
        var updater = new ServerUpdater(
            releaseClient.Object,
            new PlatformAssetSelector(OSPlatform.Windows, Architecture.X64),
            installation,
            downloader.Object,
            statusBus,
            () => new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero));

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.UpToDate, result.Outcome);
        Assert.Equal("0.5.1", result.Version);
        Assert.Equal("Server is up to date (0.5.1).", statusBus.Status);
        downloader.Verify(target => target.DownloadAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<IProgress<double>?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ReplacesPreviousInstallWhenNewerVersionAvailable()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        Directory.CreateDirectory(installDirectory);
        File.WriteAllText(Path.Combine(installDirectory, "old-file.txt"), "old");

        var installation = new ServerInstallation(installDirectory);
        installation.WriteInstalled(new InstalledServer(
            "0.5.0",
            "jukebox-media-server-v0.5.0",
            DateTimeOffset.UtcNow));

        var fixtureArchive = BuildZipFixture(workspace.Path, "newer", "0.5.1");

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            fixtureArchive,
            out var statusBus,
            installation: installation);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Updated, result.Outcome);
        Assert.True(File.Exists(Path.Combine(installDirectory, "fake-server.exe")));
        Assert.False(File.Exists(Path.Combine(installDirectory, "old-file.txt")));
        Assert.Equal("Server updated to 0.5.1.", statusBus.Status);
    }

    [Fact]
    public async Task ReturnsNoNetworkWhenReleaseClientThrowsHttpException()
    {
        using var workspace = new TempDirectory();

        var releaseClient = new Mock<IGitHubReleaseClient>();
        releaseClient
            .Setup(target => target.GetLatestServerReleaseAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("dns failed"));

        var statusBus = new UpdateStatusBus();
        var updater = new ServerUpdater(
            releaseClient.Object,
            new PlatformAssetSelector(OSPlatform.Windows, Architecture.X64),
            new ServerInstallation(Path.Combine(workspace.Path, "install")),
            new Mock<IArchiveDownloader>(MockBehavior.Strict).Object,
            statusBus);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.NoNetwork, result.Outcome);
        Assert.Contains("GitHub", statusBus.Status);
    }

    [Fact]
    public async Task ReturnsNoAssetWhenPlatformUnsupported()
    {
        using var workspace = new TempDirectory();

        var releaseClient = new Mock<IGitHubReleaseClient>();
        releaseClient
            .Setup(target => target.GetLatestServerReleaseAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"));

        var statusBus = new UpdateStatusBus();
        var updater = new ServerUpdater(
            releaseClient.Object,
            new PlatformAssetSelector(OSPlatform.Linux, Architecture.Arm64),
            new ServerInstallation(Path.Combine(workspace.Path, "install")),
            new Mock<IArchiveDownloader>(MockBehavior.Strict).Object,
            statusBus);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.NoAssetForPlatform, result.Outcome);
        Assert.Contains("linux-arm64", statusBus.Status);
    }

    [Fact]
    public async Task RollsBackPreviousInstallWhenExtractionFails()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        Directory.CreateDirectory(installDirectory);
        File.WriteAllText(Path.Combine(installDirectory, "important.txt"), "keep");

        var installation = new ServerInstallation(installDirectory);
        installation.WriteInstalled(new InstalledServer(
            "0.5.0",
            "jukebox-media-server-v0.5.0",
            DateTimeOffset.UtcNow));

        var corruptArchive = Path.Combine(workspace.Path, "broken.zip");
        File.WriteAllText(corruptArchive, "this is not a zip");

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            corruptArchive,
            out var statusBus,
            installation: installation);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Failed, result.Outcome);
        Assert.True(File.Exists(Path.Combine(installDirectory, "important.txt")));
        Assert.Contains("Previous version kept", statusBus.Status);
    }

    [Fact]
    public async Task PublishesLatestServerOnTheBus()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        var release = BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip");
        var fixture = BuildZipFixture(workspace.Path, "bus", "0.5.1");

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            release,
            fixture,
            out var statusBus);

        await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.NotNull(statusBus.LatestServer);
        Assert.Equal("0.5.1", statusBus.LatestServer!.Version);
    }

    [Fact]
    public async Task SupportsTarGzArchives()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");
        var fixture = BuildTarGzFixture(workspace.Path);

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Linux,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-linux-x64.tar.gz"),
            fixture,
            out _);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Updated, result.Outcome);
        Assert.True(File.Exists(Path.Combine(installDirectory, "fake-server")));
    }

    [Fact]
    public async Task StopsServerBeforeSwapAndStartsAfter()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        Directory.CreateDirectory(installDirectory);
        File.WriteAllText(Path.Combine(installDirectory, "old-file.txt"), "old");

        var installation = new ServerInstallation(installDirectory);
        installation.WriteInstalled(new InstalledServer(
            "0.5.0",
            "jukebox-media-server-v0.5.0",
            DateTimeOffset.UtcNow));

        var fixtureArchive = BuildZipFixture(workspace.Path, "gated", "0.5.1");
        var gate = new RecordingProcessGate(
            stopProbePath: Path.Combine(installDirectory, "old-file.txt"),
            startProbePath: Path.Combine(installDirectory, "fake-server.exe"));

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            fixtureArchive,
            out _,
            installation: installation,
            processGate: gate);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Updated, result.Outcome);
        Assert.Equal(1, gate.StopCallCount);
        Assert.Equal(1, gate.StartCallCount);
        Assert.True(gate.StopProbeExisted);
        Assert.True(gate.StartProbeExisted);
    }

    [Fact]
    public async Task StartsServerAfterFirstInstall()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");
        var fixtureArchive = BuildZipFixture(workspace.Path, "first", "0.5.1");
        var gate = new RecordingProcessGate(
            stopProbePath: Path.Combine(installDirectory, "fake-server.exe"),
            startProbePath: Path.Combine(installDirectory, "fake-server.exe"));

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            fixtureArchive,
            out _,
            processGate: gate);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Updated, result.Outcome);
        Assert.Equal(1, gate.StartCallCount);
        Assert.True(gate.StartProbeExisted);
    }

    [Fact]
    public async Task LeavesServerAloneWhenExtractionFails()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        Directory.CreateDirectory(installDirectory);

        var installation = new ServerInstallation(installDirectory);
        installation.WriteInstalled(new InstalledServer(
            "0.5.0",
            "jukebox-media-server-v0.5.0",
            DateTimeOffset.UtcNow));

        var corruptArchive = Path.Combine(workspace.Path, "broken.zip");
        File.WriteAllText(corruptArchive, "this is not a zip");

        var gate = new RecordingProcessGate(
            stopProbePath: corruptArchive,
            startProbePath: corruptArchive);

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            corruptArchive,
            out _,
            installation: installation,
            processGate: gate);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Failed, result.Outcome);
        Assert.Equal(0, gate.StopCallCount);
        Assert.Equal(0, gate.StartCallCount);
    }

    [Fact]
    public async Task RestartsServerEvenWhenStopThrows()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "install");

        Directory.CreateDirectory(installDirectory);

        var installation = new ServerInstallation(installDirectory);
        installation.WriteInstalled(new InstalledServer(
            "0.5.0",
            "jukebox-media-server-v0.5.0",
            DateTimeOffset.UtcNow));

        var fixtureArchive = BuildZipFixture(workspace.Path, "stop-throws", "0.5.1");
        var gate = new ThrowingStopGate();

        var updater = BuildUpdater(
            installDirectory,
            OSPlatform.Windows,
            Architecture.X64,
            BuildRelease("0.5.1", "jukebox-media-server-windows-x64.zip"),
            fixtureArchive,
            out _,
            installation: installation,
            processGate: gate);

        var result = await updater.UpdateIfNewerAsync(CancellationToken.None);

        Assert.Equal(ServerUpdateOutcome.Failed, result.Outcome);
        Assert.Equal(1, gate.StartCallCount);
    }

    private sealed class ThrowingStopGate : IServerProcessGate
    {
        public int StartCallCount { get; private set; }

        public Task StartAfterUpdateAsync(CancellationToken cancellationToken)
        {
            StartCallCount++;

            return Task.CompletedTask;
        }

        public Task StopForUpdateAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("stop failed");
    }

    private sealed class RecordingProcessGate : IServerProcessGate
    {
        private readonly string startProbePath;
        private readonly string stopProbePath;

        public RecordingProcessGate(string stopProbePath, string startProbePath)
        {
            this.stopProbePath = stopProbePath;
            this.startProbePath = startProbePath;
        }

        public int StartCallCount { get; private set; }

        public bool StartProbeExisted { get; private set; }

        public int StopCallCount { get; private set; }

        public bool StopProbeExisted { get; private set; }

        public Task StartAfterUpdateAsync(CancellationToken cancellationToken)
        {
            StartCallCount++;
            StartProbeExisted = File.Exists(startProbePath);

            return Task.CompletedTask;
        }

        public Task StopForUpdateAsync(CancellationToken cancellationToken)
        {
            StopCallCount++;
            StopProbeExisted = File.Exists(stopProbePath);

            return Task.CompletedTask;
        }
    }

    private static LatestRelease BuildRelease(string version, string assetName)
    {
        return new LatestRelease(
            $"jukebox-media-server-v{version}",
            version,
            new List<ReleaseAsset>
            {
                new(assetName, "https://example/" + assetName, 0),
            });
    }

    private static string BuildZipFixture(string workspace, string contentMarker, string version)
    {
        var sourceDirectory = Path.Combine(workspace, $"fixture-src-{Guid.NewGuid():N}");
        Directory.CreateDirectory(sourceDirectory);
        File.WriteAllText(
            Path.Combine(sourceDirectory, "fake-server.exe"),
            $"binary-content-{contentMarker}-{version}");
        File.WriteAllText(Path.Combine(sourceDirectory, "README.txt"), "readme");

        var archivePath = Path.Combine(workspace, $"fixture-{Guid.NewGuid():N}.zip");
        ZipFile.CreateFromDirectory(sourceDirectory, archivePath);
        Directory.Delete(sourceDirectory, recursive: true);

        return archivePath;
    }

    private static string BuildTarGzFixture(string workspace)
    {
        var sourceDirectory = Path.Combine(workspace, $"fixture-tar-{Guid.NewGuid():N}");
        Directory.CreateDirectory(sourceDirectory);
        File.WriteAllText(Path.Combine(sourceDirectory, "fake-server"), "linux-binary");

        var archivePath = Path.Combine(workspace, $"fixture-{Guid.NewGuid():N}.tar.gz");

        using (var fileStream = File.Create(archivePath))
        using (var gzip = new GZipStream(fileStream, CompressionLevel.Fastest))
        {
            TarFile.CreateFromDirectory(sourceDirectory, gzip, includeBaseDirectory: false);
        }

        Directory.Delete(sourceDirectory, recursive: true);
        return archivePath;
    }

    private static ServerUpdater BuildUpdater(
        string installDirectory,
        OSPlatform platform,
        Architecture architecture,
        LatestRelease release,
        string fixtureArchivePath,
        out UpdateStatusBus statusBus,
        IServerInstallation? installation = null,
        IServerProcessGate? processGate = null)
    {
        var releaseClient = new Mock<IGitHubReleaseClient>();
        releaseClient
            .Setup(target => target.GetLatestServerReleaseAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(release);

        var downloader = new Mock<IArchiveDownloader>();
        downloader
            .Setup(target => target.DownloadAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<IProgress<double>?>(),
                It.IsAny<CancellationToken>()))
            .Returns<string, string, IProgress<double>?, CancellationToken>((_, destination, _, _) =>
            {
                File.Copy(fixtureArchivePath, destination, overwrite: true);
                return Task.CompletedTask;
            });

        statusBus = new UpdateStatusBus();
        installation ??= new ServerInstallation(installDirectory);

        return new ServerUpdater(
            releaseClient.Object,
            new PlatformAssetSelector(platform, architecture),
            installation,
            downloader.Object,
            statusBus,
            () => new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            processGate);
    }
}
