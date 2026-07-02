using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public sealed class ServerProcessManager : IServerProcessManager, IServerProcessGate
{
    private static readonly TimeSpan CrashWindow = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan[] RestartDelays =
    {
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(15),
        TimeSpan.FromSeconds(30),
    };

    private const int MaxCrashesInWindow = 5;

    private readonly Func<TimeSpan, CancellationToken, Task> delay;
    private readonly IServerExecutableLocator executableLocator;
    private readonly IServerInstallation installation;
    private readonly Func<DateTimeOffset> nowProvider;
    private readonly SemaphoreSlim operationLock = new(1, 1);
    private readonly IProcessFactory processFactory;
    private readonly object stateLock = new();
    private readonly TimeSpan stopGracePeriod;

    private IManagedProcess? currentProcess;
    private string stateDetail = string.Empty;
    private ServerProcessState state = ServerProcessState.Stopped;
    private CancellationTokenSource? supervisionCancellation;
    private Task supervisionTask = Task.CompletedTask;

    public ServerProcessManager(
        IServerInstallation installation,
        IServerExecutableLocator executableLocator,
        IProcessFactory processFactory)
        : this(
            installation,
            executableLocator,
            processFactory,
            Task.Delay,
            () => DateTimeOffset.UtcNow,
            TimeSpan.FromSeconds(5))
    {
    }

    public ServerProcessManager(
        IServerInstallation installation,
        IServerExecutableLocator executableLocator,
        IProcessFactory processFactory,
        Func<TimeSpan, CancellationToken, Task> delay,
        Func<DateTimeOffset> nowProvider,
        TimeSpan stopGracePeriod)
    {
        ArgumentNullException.ThrowIfNull(installation);
        ArgumentNullException.ThrowIfNull(executableLocator);
        ArgumentNullException.ThrowIfNull(processFactory);
        ArgumentNullException.ThrowIfNull(delay);
        ArgumentNullException.ThrowIfNull(nowProvider);

        this.installation = installation;
        this.executableLocator = executableLocator;
        this.processFactory = processFactory;
        this.delay = delay;
        this.nowProvider = nowProvider;
        this.stopGracePeriod = stopGracePeriod;
    }

    public event EventHandler<ServerProcessStateChangedEventArgs>? StateChanged;

    public ServerProcessState State
    {
        get
        {
            lock (stateLock)
            {
                return state;
            }
        }
    }

    public string StateDetail
    {
        get
        {
            lock (stateLock)
            {
                return stateDetail;
            }
        }
    }

    private string DataDirectory =>
        Path.GetDirectoryName(installation.InstallDirectory)
            ?? throw new InvalidOperationException(
                $"Install directory has no parent: {installation.InstallDirectory}.");

    private string LogFilePath => Path.Combine(DataDirectory, "logs", "server.log");

    private string PidFilePath => Path.Combine(DataDirectory, "server.pid");

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await operationLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            if (State is ServerProcessState.Starting
                or ServerProcessState.Running
                or ServerProcessState.Restarting)
            {
                return;
            }

            var executablePath = executableLocator.Locate();

            if (executablePath is null)
            {
                if (installation.GetInstalled() is null)
                {
                    SetState(ServerProcessState.NotInstalled, "Server not installed yet.");
                }
                else
                {
                    SetState(
                        ServerProcessState.Failed,
                        $"Server executable not found in {installation.InstallDirectory}. "
                        + "Restart the launcher to repair the installation.");
                }

                return;
            }

            KillOrphanFromPreviousLaunch();
            SetState(ServerProcessState.Starting, "Server starting…");

            IManagedProcess process;

            try
            {
                process = processFactory.Start(BuildStartInfo(executablePath));
            }
            catch (Exception error)
            {
                SetState(
                    ServerProcessState.Failed,
                    $"Couldn't start the server: {error.Message}. "
                    + $"Check the log at {LogFilePath}.");

                return;
            }

            WritePidFile(process.Id);

            var cancellation = new CancellationTokenSource();

            lock (stateLock)
            {
                currentProcess = process;
                supervisionCancellation = cancellation;
            }

            SetState(ServerProcessState.Running, "Server running");
            supervisionTask = SuperviseAsync(process, executablePath, cancellation.Token);
        }
        finally
        {
            operationLock.Release();
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        await operationLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            IManagedProcess? process;
            CancellationTokenSource? cancellation;
            Task supervision;

            lock (stateLock)
            {
                process = currentProcess;
                cancellation = supervisionCancellation;
                supervision = supervisionTask;
                currentProcess = null;
                supervisionCancellation = null;
                supervisionTask = Task.CompletedTask;
            }

            if (process is null)
            {
                return;
            }

            cancellation?.Cancel();

            await TerminateAsync(process).ConfigureAwait(false);
            await AwaitCompletionIgnoringCancellation(supervision).ConfigureAwait(false);

            cancellation?.Dispose();
            process.Dispose();
            DeletePidFile();
            SetState(ServerProcessState.Stopped, "Server stopped");
        }
        finally
        {
            operationLock.Release();
        }
    }

    public Task StartAfterUpdateAsync(CancellationToken cancellationToken) =>
        StartAsync(cancellationToken);

    public Task StopForUpdateAsync(CancellationToken cancellationToken) =>
        StopAsync(cancellationToken);

    private ServerProcessStartInfo BuildStartInfo(string executablePath)
    {
        var workingDirectory = Path.GetDirectoryName(executablePath)
            ?? throw new InvalidOperationException(
                $"Server executable has no parent directory: {executablePath}.");
        var logPath = ServerLogFile.PrepareForStart(DataDirectory);

        return new ServerProcessStartInfo(executablePath, workingDirectory, logPath);
    }

    private void DeletePidFile()
    {
        try
        {
            if (File.Exists(PidFilePath))
            {
                File.Delete(PidFilePath);
            }
        }
        catch (IOException)
        {
        }
    }

    private void KillOrphanFromPreviousLaunch()
    {
        if (!File.Exists(PidFilePath))
        {
            return;
        }

        var content = File.ReadAllText(PidFilePath).Trim();

        if (int.TryParse(content, NumberStyles.Integer, CultureInfo.InvariantCulture, out var processId))
        {
            var executablePath = processFactory.GetExecutablePath(processId);

            if (executablePath is not null)
            {
                var installRoot = Path.TrimEndingDirectorySeparator(
                    Path.GetFullPath(installation.InstallDirectory));
                var fullExecutablePath = Path.GetFullPath(executablePath);

                if (fullExecutablePath.StartsWith(
                        installRoot + Path.DirectorySeparatorChar,
                        StringComparison.OrdinalIgnoreCase))
                {
                    processFactory.KillById(processId);
                }
            }
        }

        DeletePidFile();
    }

    private void SetState(ServerProcessState newState, string detail)
    {
        lock (stateLock)
        {
            state = newState;
            stateDetail = detail;
        }

        StateChanged?.Invoke(this, new ServerProcessStateChangedEventArgs(newState, detail));
    }

    private async Task SuperviseAsync(
        IManagedProcess process,
        string executablePath,
        CancellationToken cancellationToken)
    {
        var crashTimes = new List<DateTimeOffset>();
        var current = process;

        while (true)
        {
            int exitCode;

            try
            {
                exitCode = await current.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            current.Dispose();

            lock (stateLock)
            {
                currentProcess = null;
            }

            var now = nowProvider();

            crashTimes.Add(now);
            crashTimes.RemoveAll(crashTime => now - crashTime > CrashWindow);

            if (crashTimes.Count >= MaxCrashesInWindow)
            {
                DeletePidFile();
                SetState(
                    ServerProcessState.Failed,
                    "The server keeps crashing and has been stopped. "
                    + $"Check the log at {LogFilePath}, "
                    + "then restart the launcher to try again.");

                return;
            }

            var delayIndex = Math.Min(crashTimes.Count - 1, RestartDelays.Length - 1);

            SetState(
                ServerProcessState.Restarting,
                $"Server exited unexpectedly (code {exitCode}). Restarting…");

            try
            {
                await delay(RestartDelays[delayIndex], cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            try
            {
                current = processFactory.Start(BuildStartInfo(executablePath));
            }
            catch (Exception error)
            {
                DeletePidFile();
                SetState(
                    ServerProcessState.Failed,
                    $"Couldn't start the server: {error.Message}. "
                    + $"Check the log at {LogFilePath}.");

                return;
            }

            lock (stateLock)
            {
                currentProcess = current;
            }

            WritePidFile(current.Id);
            SetState(ServerProcessState.Running, "Server running");
        }
    }

    private async Task TerminateAsync(IManagedProcess process)
    {
        if (process.TrySignalTerminate())
        {
            using var graceCancellation = new CancellationTokenSource(stopGracePeriod);

            try
            {
                await process.WaitForExitAsync(graceCancellation.Token).ConfigureAwait(false);
                return;
            }
            catch (OperationCanceledException)
            {
            }
        }

        process.Kill();

        using var killCancellation = new CancellationTokenSource(stopGracePeriod);

        try
        {
            await process.WaitForExitAsync(killCancellation.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task AwaitCompletionIgnoringCancellation(Task task)
    {
        try
        {
            await task.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void WritePidFile(int processId)
    {
        Directory.CreateDirectory(DataDirectory);
        File.WriteAllText(
            PidFilePath,
            processId.ToString(CultureInfo.InvariantCulture));
    }
}
