using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Jukebox.Launcher.Server;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class ServerProcessManagerTests
{
    [Fact]
    public async Task StartReachesRunningAndWritesPidFile()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Running, manager.State);
        Assert.Single(workspace.Factory.Started);
        Assert.Equal(
            workspace.Factory.Started[0].Id.ToString(),
            File.ReadAllText(workspace.PidFilePath).Trim());
        Assert.Equal(
            workspace.BinaryPath,
            workspace.Factory.StartInfos[0].ExecutablePath);
        Assert.Equal(
            Path.GetDirectoryName(workspace.BinaryPath),
            workspace.Factory.StartInfos[0].WorkingDirectory);
    }

    [Fact]
    public async Task StartReportsNotInstalledWhenNothingOnDisk()
    {
        using var workspace = new Workspace(installServer: false);
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.NotInstalled, manager.State);
        Assert.Empty(workspace.Factory.Started);
    }

    [Fact]
    public async Task StartFailsWhenExecutableMissingFromInstall()
    {
        using var workspace = new Workspace();

        File.Delete(workspace.BinaryPath);

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Failed, manager.State);
        Assert.Equal(
            $"Server executable not found in {workspace.InstallDirectory}. "
            + "Restart the launcher to repair the installation.",
            manager.StateDetail);
    }

    [Fact]
    public async Task StartFailsWithLogPathWhenSpawnThrows()
    {
        using var workspace = new Workspace();

        workspace.Factory.StartError = new InvalidOperationException("access denied");

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Failed, manager.State);
        Assert.Equal(
            $"Couldn't start the server: access denied. Check the log at {workspace.LogFilePath}.",
            manager.StateDetail);
    }

    [Fact]
    public async Task StartIsIdempotentWhileRunning()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);
        await manager.StartAsync(CancellationToken.None);

        Assert.Single(workspace.Factory.Started);
    }

    [Fact]
    public async Task StopKillsProcessAndDeletesPidFile()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);
        await manager.StopAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Stopped, manager.State);
        Assert.True(workspace.Factory.Started[0].KillCalled);
        Assert.False(File.Exists(workspace.PidFilePath));
    }

    [Fact]
    public async Task StopPrefersGracefulTerminationWhenSupported()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        workspace.Factory.SupportsTerminateSignal = true;

        await manager.StartAsync(CancellationToken.None);
        await manager.StopAsync(CancellationToken.None);

        Assert.True(workspace.Factory.Started[0].TerminateSignalled);
        Assert.False(workspace.Factory.Started[0].KillCalled);
        Assert.Equal(ServerProcessState.Stopped, manager.State);
    }

    [Fact]
    public async Task StopIsSafeWhenNothingRunning()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StopAsync(CancellationToken.None);

        Assert.Empty(workspace.Factory.Started);
    }

    [Fact]
    public async Task KillsOrphanWhosePathIsInsideInstallDirectory()
    {
        using var workspace = new Workspace();

        File.WriteAllText(workspace.PidFilePath, "4242");
        workspace.Factory.ExecutablePaths[4242] = workspace.BinaryPath;

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.Contains(4242, workspace.Factory.Killed);
    }

    [Fact]
    public async Task LeavesForeignProcessWithRecycledPidAlone()
    {
        using var workspace = new Workspace();

        File.WriteAllText(workspace.PidFilePath, "4242");
        workspace.Factory.ExecutablePaths[4242] =
            OperatingSystem.IsWindows() ? @"C:\Windows\notepad.exe" : "/usr/bin/vi";

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.DoesNotContain(4242, workspace.Factory.Killed);
    }

    [Fact]
    public async Task LeavesProcessInSiblingDirectoryWithSharedPrefixAlone()
    {
        using var workspace = new Workspace();

        File.WriteAllText(workspace.PidFilePath, "4242");
        workspace.Factory.ExecutablePaths[4242] =
            workspace.InstallDirectory + "-evil" + Path.DirectorySeparatorChar + "jukebox-media-server";

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.DoesNotContain(4242, workspace.Factory.Killed);
    }

    [Fact]
    public async Task UnexpectedExitDisposesTheProcess()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        workspace.Factory.Started[0].Exit(1);

        await WaitForAsync(() => workspace.Factory.Started[0].Disposed);
    }

    [Fact]
    public async Task IgnoresMalformedPidFile()
    {
        using var workspace = new Workspace();

        File.WriteAllText(workspace.PidFilePath, "not-a-number");

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Running, manager.State);
        Assert.Empty(workspace.Factory.Killed);
    }

    [Fact]
    public async Task RaisesStateChangedEvents()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();
        var states = new List<ServerProcessState>();

        manager.StateChanged += (_, eventArguments) => states.Add(eventArguments.State);

        await manager.StartAsync(CancellationToken.None);

        Assert.Equal(
            new[] { ServerProcessState.Starting, ServerProcessState.Running },
            states);
    }

    [Fact]
    public async Task RestartsAfterUnexpectedExit()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        workspace.Factory.Started[0].Exit(1);

        await WaitForAsync(() => workspace.Factory.Started.Count == 2);
        await WaitForAsync(() => manager.State == ServerProcessState.Running);

        Assert.Equal(
            workspace.Factory.Started[1].Id.ToString(),
            File.ReadAllText(workspace.PidFilePath).Trim());
        Assert.Equal(new[] { TimeSpan.FromSeconds(1) }, workspace.RecordedDelays);
    }

    [Fact]
    public async Task KeepsBackoffLowWhenCrashesAreSpreadOut()
    {
        using var workspace = new Workspace();

        // Advance the clock 3 minutes per crash so the give-up window never fills.
        var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
        workspace.NowProvider = () => now;

        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        for (var crash = 0; crash < 6; crash++)
        {
            var processCountBefore = workspace.Factory.Started.Count;

            now = now.AddMinutes(3);
            workspace.Factory.Started[^1].Exit(1);

            await WaitForAsync(() => workspace.Factory.Started.Count == processCountBefore + 1);
        }

        Assert.Equal(
            new[]
            {
                TimeSpan.FromSeconds(1),
                TimeSpan.FromSeconds(1),
                TimeSpan.FromSeconds(1),
                TimeSpan.FromSeconds(1),
                TimeSpan.FromSeconds(1),
                TimeSpan.FromSeconds(1),
            },
            workspace.RecordedDelays);
    }

    [Fact]
    public async Task GivesUpAfterFiveCrashesInWindow()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        // The fixed clock keeps every crash inside the 2-minute window.
        for (var crash = 0; crash < 4; crash++)
        {
            var processCountBefore = workspace.Factory.Started.Count;

            workspace.Factory.Started[^1].Exit(1);

            await WaitForAsync(() => workspace.Factory.Started.Count == processCountBefore + 1);
        }

        workspace.Factory.Started[^1].Exit(1);

        await WaitForAsync(() => manager.State == ServerProcessState.Failed);

        Assert.Equal(5, workspace.Factory.Started.Count);
        Assert.Equal(
            "The server keeps crashing and has been stopped. "
            + $"Check the log at {workspace.LogFilePath}, "
            + "then restart the launcher to try again.",
            manager.StateDetail);
        Assert.Equal(
            new[]
            {
                TimeSpan.FromSeconds(1),
                TimeSpan.FromSeconds(2),
                TimeSpan.FromSeconds(5),
                TimeSpan.FromSeconds(15),
            },
            workspace.RecordedDelays);
        Assert.False(File.Exists(workspace.PidFilePath));
    }

    [Fact]
    public async Task DeliberateStopSuppressesRestart()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);
        await manager.StopAsync(CancellationToken.None);

        await Task.Delay(100);

        Assert.Single(workspace.Factory.Started);
        Assert.Equal(ServerProcessState.Stopped, manager.State);
    }

    [Fact]
    public async Task FailsWhenRestartSpawnThrows()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);

        workspace.Factory.StartError = new InvalidOperationException("file locked");
        workspace.Factory.Started[0].Exit(1);

        await WaitForAsync(() => manager.State == ServerProcessState.Failed);

        Assert.Equal(
            $"Couldn't start the server: file locked. Check the log at {workspace.LogFilePath}.",
            manager.StateDetail);
    }

    [Fact]
    public async Task GateStopAndStartRoundTrip()
    {
        using var workspace = new Workspace();
        var manager = workspace.BuildManager();

        await manager.StartAsync(CancellationToken.None);
        await ((IServerProcessGate)manager).StopForUpdateAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Stopped, manager.State);

        await ((IServerProcessGate)manager).StartAfterUpdateAsync(CancellationToken.None);

        Assert.Equal(ServerProcessState.Running, manager.State);
        Assert.Equal(2, workspace.Factory.Started.Count);
    }

    private static async Task WaitForAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);

        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException("Condition was not met within 5 seconds.");
            }

            await Task.Delay(10);
        }
    }

    internal sealed class Workspace : IDisposable
    {
        private readonly TempDirectory temporaryDirectory = new();

        public Workspace(bool installServer = true)
        {
            InstallDirectory = Path.Combine(temporaryDirectory.Path, "server");
            var bundleDirectory = Path.Combine(InstallDirectory, "jukebox-media-server-test");
            BinaryPath = Path.Combine(bundleDirectory, "jukebox-media-server");

            if (installServer)
            {
                Directory.CreateDirectory(bundleDirectory);
                File.WriteAllText(BinaryPath, "binary");

                var installation = new ServerInstallation(InstallDirectory);
                installation.WriteInstalled(new InstalledServer(
                    "0.5.1",
                    "jukebox-media-server-v0.5.1",
                    DateTimeOffset.UtcNow));
            }
        }

        public string BinaryPath { get; }

        public FakeProcessFactory Factory { get; } = new();

        public string InstallDirectory { get; }

        public string LogFilePath =>
            Path.Combine(temporaryDirectory.Path, "logs", "server.log");

        public Func<DateTimeOffset> NowProvider { get; set; } =
            () => new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);

        public string PidFilePath => Path.Combine(temporaryDirectory.Path, "server.pid");

        public List<TimeSpan> RecordedDelays { get; } = new();

        public ServerProcessManager BuildManager()
        {
            var installation = new ServerInstallation(InstallDirectory);

            return new ServerProcessManager(
                installation,
                new ServerExecutableLocator(installation, "jukebox-media-server"),
                Factory,
                (delayDuration, _) =>
                {
                    RecordedDelays.Add(delayDuration);
                    return Task.CompletedTask;
                },
                () => NowProvider(),
                stopGracePeriod: TimeSpan.FromMilliseconds(200));
        }

        public void Dispose() => temporaryDirectory.Dispose();
    }

    internal sealed class FakeProcessFactory : IProcessFactory
    {
        public Dictionary<int, string> ExecutablePaths { get; } = new();

        public List<int> Killed { get; } = new();

        public List<FakeManagedProcess> Started { get; } = new();

        public Exception? StartError { get; set; }

        public List<ServerProcessStartInfo> StartInfos { get; } = new();

        public bool SupportsTerminateSignal { get; set; }

        public string? GetExecutablePath(int processId) =>
            ExecutablePaths.TryGetValue(processId, out var path) ? path : null;

        public void KillById(int processId) => Killed.Add(processId);

        public IManagedProcess Start(ServerProcessStartInfo startInfo)
        {
            if (StartError is not null)
            {
                throw StartError;
            }

            var process = new FakeManagedProcess(4300 + Started.Count, SupportsTerminateSignal);

            Started.Add(process);
            StartInfos.Add(startInfo);

            return process;
        }
    }

    internal sealed class FakeManagedProcess : IManagedProcess
    {
        private readonly TaskCompletionSource<int> exit =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly bool supportsTerminateSignal;

        public FakeManagedProcess(int id, bool supportsTerminateSignal)
        {
            Id = id;
            this.supportsTerminateSignal = supportsTerminateSignal;
        }

        public int Id { get; }

        public bool Disposed { get; private set; }

        public bool KillCalled { get; private set; }

        public bool TerminateSignalled { get; private set; }

        public void Dispose()
        {
            Disposed = true;
        }

        public void Exit(int code) => exit.TrySetResult(code);

        public void Kill()
        {
            KillCalled = true;
            exit.TrySetResult(-1);
        }

        public bool TrySignalTerminate()
        {
            TerminateSignalled = true;

            if (supportsTerminateSignal)
            {
                exit.TrySetResult(0);
                return true;
            }

            return false;
        }

        public Task<int> WaitForExitAsync(CancellationToken cancellationToken) =>
            exit.Task.WaitAsync(cancellationToken);
    }
}
