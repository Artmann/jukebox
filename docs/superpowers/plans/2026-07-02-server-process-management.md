# Server Process Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The launcher starts the installed jukebox media server, restarts it on crashes with backoff, stops it on quit, and stops/restarts it around auto-update installs.

**Architecture:** A `ServerProcessManager` supervisor in `launcher/Launcher/Server/` wraps `System.Diagnostics.Process` behind an `IProcessFactory` abstraction so supervision logic is unit-testable with fakes. It implements `IServerProcessGate`, which `ServerUpdater` calls to stop the server just before the install-directory swap and restart it after. The About window shows a live server-state line.

**Tech Stack:** .NET 9, Avalonia (headless xunit for UI tests), xunit + Moq, existing `TempDirectory` test helper.

**Spec:** `docs/superpowers/specs/2026-07-02-server-process-management-design.md`

## Global Constraints

- All commands run from `launcher/` (the directory containing `Launcher.sln`): `dotnet test`.
- Namespaces: production code `Jukebox.Launcher.Server` (except noted), tests `Jukebox.Launcher.Tests`.
- Follow the existing launcher C# style: file-scoped namespaces, braces always, whole-word variable names, alphabetical member ordering where the file already does that, constructor null-checks via `ArgumentNullException.ThrowIfNull`.
- User-facing strings must match the spec exactly:
  - `Server executable not found in {installDirectory}. Restart the launcher to repair the installation.`
  - `Couldn't start the server: {reason}. Check the log at {logPath}.`
  - `The server keeps crashing and has been stopped. Check the log at {logPath}, then restart the launcher to try again.`
- Commit messages: conventional commits, no Co-Authored-By lines.
- Never use the `!` null-forgiving operator in new code; use `?? throw` instead.

---

### Task 1: ServerExecutableLocator

Finds the server executable inside the install directory. Release archives extract to `<installDir>/jukebox-media-server-<target>/jukebox-media-server(.exe)`, but tolerate a binary at the install root too.

**Files:**
- Create: `launcher/Launcher/Server/IServerExecutableLocator.cs`
- Create: `launcher/Launcher/Server/ServerExecutableLocator.cs`
- Test: `launcher/Launcher.Tests/ServerExecutableLocatorTests.cs`

**Interfaces:**
- Consumes: `IServerInstallation.InstallDirectory` (existing).
- Produces: `IServerExecutableLocator` with `string? Locate()` — full path of the executable or `null`. Constructor `ServerExecutableLocator(IServerInstallation installation)` picks the binary name per OS; test constructor `ServerExecutableLocator(IServerInstallation installation, string binaryFileName)`.

- [ ] **Step 1: Write the failing tests**

Create `launcher/Launcher.Tests/ServerExecutableLocatorTests.cs`:

```csharp
using System.IO;
using Jukebox.Launcher.Server;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class ServerExecutableLocatorTests
{
    [Fact]
    public void FindsBinaryInTargetNamedSubdirectory()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");
        var bundleDirectory = Path.Combine(installDirectory, "jukebox-media-server-windows-x64");

        Directory.CreateDirectory(bundleDirectory);
        var binaryPath = Path.Combine(bundleDirectory, "jukebox-media-server.exe");
        File.WriteAllText(binaryPath, "binary");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server.exe");

        Assert.Equal(binaryPath, locator.Locate());
    }

    [Fact]
    public void FindsBinaryAtInstallRoot()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");

        Directory.CreateDirectory(installDirectory);
        var binaryPath = Path.Combine(installDirectory, "jukebox-media-server");
        File.WriteAllText(binaryPath, "binary");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server");

        Assert.Equal(binaryPath, locator.Locate());
    }

    [Fact]
    public void ReturnsNullWhenInstallDirectoryMissing()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "does-not-exist");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server");

        Assert.Null(locator.Locate());
    }

    [Fact]
    public void ReturnsNullWhenBinaryAbsent()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");

        Directory.CreateDirectory(Path.Combine(installDirectory, "jukebox-media-server-windows-x64"));

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server.exe");

        Assert.Null(locator.Locate());
    }

    [Fact]
    public void IgnoresUnrelatedSubdirectories()
    {
        using var workspace = new TempDirectory();
        var installDirectory = Path.Combine(workspace.Path, "server");
        var unrelated = Path.Combine(installDirectory, "other-folder");

        Directory.CreateDirectory(unrelated);
        File.WriteAllText(Path.Combine(unrelated, "jukebox-media-server"), "binary");

        var locator = new ServerExecutableLocator(
            new ServerInstallation(installDirectory),
            "jukebox-media-server");

        Assert.Null(locator.Locate());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~ServerExecutableLocatorTests"`
Expected: build FAILS with "The type or namespace name 'ServerExecutableLocator' could not be found".

- [ ] **Step 3: Write the implementation**

Create `launcher/Launcher/Server/IServerExecutableLocator.cs`:

```csharp
namespace Jukebox.Launcher.Server;

public interface IServerExecutableLocator
{
    string? Locate();
}
```

Create `launcher/Launcher/Server/ServerExecutableLocator.cs`:

```csharp
using System;
using System.IO;
using System.Linq;

namespace Jukebox.Launcher.Server;

public sealed class ServerExecutableLocator : IServerExecutableLocator
{
    private readonly string binaryFileName;
    private readonly IServerInstallation installation;

    public ServerExecutableLocator(IServerInstallation installation)
        : this(
            installation,
            OperatingSystem.IsWindows() ? "jukebox-media-server.exe" : "jukebox-media-server")
    {
    }

    public ServerExecutableLocator(IServerInstallation installation, string binaryFileName)
    {
        ArgumentNullException.ThrowIfNull(installation);
        ArgumentException.ThrowIfNullOrWhiteSpace(binaryFileName);

        this.installation = installation;
        this.binaryFileName = binaryFileName;
    }

    public string? Locate()
    {
        var installDirectory = installation.InstallDirectory;

        if (!Directory.Exists(installDirectory))
        {
            return null;
        }

        var rootCandidate = Path.Combine(installDirectory, binaryFileName);

        if (File.Exists(rootCandidate))
        {
            return rootCandidate;
        }

        var bundleDirectories = Directory
            .GetDirectories(installDirectory, "jukebox-media-server-*")
            .OrderBy(directory => directory, StringComparer.Ordinal);

        foreach (var bundleDirectory in bundleDirectories)
        {
            var candidate = Path.Combine(bundleDirectory, binaryFileName);

            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~ServerExecutableLocatorTests"`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add launcher/Launcher/Server/IServerExecutableLocator.cs launcher/Launcher/Server/ServerExecutableLocator.cs launcher/Launcher.Tests/ServerExecutableLocatorTests.cs
git commit -m "feat(launcher): locate installed server executable"
```

---

### Task 2: ServerLogFile

Log path + size-based rotation. The server's stdout/stderr will be appended to `logs/server.log` under the Jukebox data root (the parent of the install directory).

**Files:**
- Create: `launcher/Launcher/Server/ServerLogFile.cs`
- Test: `launcher/Launcher.Tests/ServerLogFileTests.cs`

**Interfaces:**
- Produces: `static class ServerLogFile` with `const long MaxSizeInBytes = 5 * 1024 * 1024` and `static string PrepareForStart(string dataDirectory)` — ensures `<dataDirectory>/logs/` exists, rotates `server.log` to `server.log.old` when it exceeds `MaxSizeInBytes` (replacing any previous `.old`), and returns the full path of `server.log`.

- [ ] **Step 1: Write the failing tests**

Create `launcher/Launcher.Tests/ServerLogFileTests.cs`:

```csharp
using System.IO;
using Jukebox.Launcher.Server;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class ServerLogFileTests
{
    [Fact]
    public void CreatesLogsDirectoryAndReturnsPath()
    {
        using var workspace = new TempDirectory();

        var logPath = ServerLogFile.PrepareForStart(workspace.Path);

        Assert.Equal(Path.Combine(workspace.Path, "logs", "server.log"), logPath);
        Assert.True(Directory.Exists(Path.Combine(workspace.Path, "logs")));
    }

    [Fact]
    public void LeavesSmallLogInPlace()
    {
        using var workspace = new TempDirectory();
        var logsDirectory = Path.Combine(workspace.Path, "logs");

        Directory.CreateDirectory(logsDirectory);
        var logPath = Path.Combine(logsDirectory, "server.log");
        File.WriteAllText(logPath, "small log");

        ServerLogFile.PrepareForStart(workspace.Path);

        Assert.Equal("small log", File.ReadAllText(logPath));
        Assert.False(File.Exists(logPath + ".old"));
    }

    [Fact]
    public void RotatesOversizedLog()
    {
        using var workspace = new TempDirectory();
        var logsDirectory = Path.Combine(workspace.Path, "logs");

        Directory.CreateDirectory(logsDirectory);
        var logPath = Path.Combine(logsDirectory, "server.log");

        using (var stream = File.Create(logPath))
        {
            stream.SetLength(ServerLogFile.MaxSizeInBytes + 1);
        }

        File.WriteAllText(logPath + ".old", "previous rotation");

        ServerLogFile.PrepareForStart(workspace.Path);

        Assert.False(File.Exists(logPath));
        Assert.True(File.Exists(logPath + ".old"));
        Assert.Equal(ServerLogFile.MaxSizeInBytes + 1, new FileInfo(logPath + ".old").Length);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~ServerLogFileTests"`
Expected: build FAILS with "The type or namespace name 'ServerLogFile' could not be found".

- [ ] **Step 3: Write the implementation**

Create `launcher/Launcher/Server/ServerLogFile.cs`:

```csharp
using System.IO;

namespace Jukebox.Launcher.Server;

public static class ServerLogFile
{
    public const long MaxSizeInBytes = 5 * 1024 * 1024;

    public static string PrepareForStart(string dataDirectory)
    {
        var logsDirectory = Path.Combine(dataDirectory, "logs");

        Directory.CreateDirectory(logsDirectory);

        var logPath = Path.Combine(logsDirectory, "server.log");
        var logInfo = new FileInfo(logPath);

        if (logInfo.Exists && logInfo.Length > MaxSizeInBytes)
        {
            File.Move(logPath, logPath + ".old", overwrite: true);
        }

        return logPath;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~ServerLogFileTests"`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add launcher/Launcher/Server/ServerLogFile.cs launcher/Launcher.Tests/ServerLogFileTests.cs
git commit -m "feat(launcher): add server log file rotation"
```

---

### Task 3: Process abstraction and SystemProcessFactory

A thin seam over `System.Diagnostics.Process` so the supervisor is testable with fakes. The real factory redirects stdout/stderr to the log file, kills entire process trees, and can inspect/kill processes by id (for orphan handling).

**Files:**
- Create: `launcher/Launcher/Server/ServerProcessStartInfo.cs`
- Create: `launcher/Launcher/Server/IManagedProcess.cs`
- Create: `launcher/Launcher/Server/IProcessFactory.cs`
- Create: `launcher/Launcher/Server/SystemProcessFactory.cs`
- Test: `launcher/Launcher.Tests/SystemProcessFactoryTests.cs`

**Interfaces:**
- Produces:
  - `ServerProcessStartInfo(string ExecutablePath, string WorkingDirectory, string LogFilePath)` — positional record.
  - `IManagedProcess : IDisposable` — `int Id { get; }`, `Task<int> WaitForExitAsync(CancellationToken cancellationToken)` (returns exit code), `void Kill()` (entire tree, never throws), `bool TrySignalTerminate()` (SIGTERM on Unix, returns `false` on Windows or on failure).
  - `IProcessFactory` — `string? GetExecutablePath(int processId)` (null when not running or inaccessible), `void KillById(int processId)` (never throws), `IManagedProcess Start(ServerProcessStartInfo startInfo)` (throws on spawn failure).
  - `SystemProcessFactory : IProcessFactory` — the real implementation.

- [ ] **Step 1: Write the failing tests**

The smoke tests spawn real short-lived processes using OS shells, so they run on any platform.

Create `launcher/Launcher.Tests/SystemProcessFactoryTests.cs`:

```csharp
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Jukebox.Launcher.Server;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class SystemProcessFactoryTests
{
    [Fact]
    public async Task StartsRealProcessAndCapturesOutputInLog()
    {
        using var workspace = new TempDirectory();
        var logPath = Path.Combine(workspace.Path, "server.log");
        var factory = new SystemProcessFactory();

        using var process = factory.Start(BuildEchoStartInfo(workspace.Path, logPath, "hello-from-server"));

        var exitCode = await process.WaitForExitAsync(
            new CancellationTokenSource(TimeSpan.FromSeconds(30)).Token);

        Assert.Equal(0, exitCode);

        // Output pumping is asynchronous; give it a moment to flush.
        await WaitForAsync(() => File.Exists(logPath)
            && File.ReadAllText(logPath).Contains("hello-from-server"));
    }

    [Fact]
    public async Task KillTerminatesTheProcess()
    {
        using var workspace = new TempDirectory();
        var logPath = Path.Combine(workspace.Path, "server.log");
        var factory = new SystemProcessFactory();

        using var process = factory.Start(BuildSleepStartInfo(workspace.Path, logPath));

        process.Kill();

        var exitCode = await process.WaitForExitAsync(
            new CancellationTokenSource(TimeSpan.FromSeconds(30)).Token);

        Assert.NotEqual(0, exitCode);
    }

    [Fact]
    public void GetExecutablePathReturnsNullForDeadProcess()
    {
        var factory = new SystemProcessFactory();

        // Process ids are recycled, but an id this large is almost never alive;
        // if it is, MainModule access still resolves without throwing out of us.
        Assert.Null(factory.GetExecutablePath(int.MaxValue - 1));
    }

    [Fact]
    public void KillByIdSwallowsMissingProcess()
    {
        var factory = new SystemProcessFactory();

        factory.KillById(int.MaxValue - 1);
    }

    [Fact]
    public void StartThrowsForMissingExecutable()
    {
        using var workspace = new TempDirectory();
        var factory = new SystemProcessFactory();
        var startInfo = new ServerProcessStartInfo(
            Path.Combine(workspace.Path, "does-not-exist.exe"),
            workspace.Path,
            Path.Combine(workspace.Path, "server.log"));

        Assert.ThrowsAny<Exception>(() => factory.Start(startInfo));
    }

    private static ServerProcessStartInfo BuildEchoStartInfo(
        string workingDirectory,
        string logPath,
        string message)
    {
        if (OperatingSystem.IsWindows())
        {
            var shell = new ServerProcessStartInfo(
                Path.Combine(Environment.SystemDirectory, "cmd.exe"),
                workingDirectory,
                logPath);

            return shell with { Arguments = $"/c echo {message}" };
        }

        var unixShell = new ServerProcessStartInfo("/bin/sh", workingDirectory, logPath);

        return unixShell with { Arguments = $"-c \"echo {message}\"" };
    }

    private static ServerProcessStartInfo BuildSleepStartInfo(
        string workingDirectory,
        string logPath)
    {
        if (OperatingSystem.IsWindows())
        {
            var shell = new ServerProcessStartInfo(
                Path.Combine(Environment.SystemDirectory, "cmd.exe"),
                workingDirectory,
                logPath);

            return shell with { Arguments = "/c ping -n 60 127.0.0.1" };
        }

        var unixShell = new ServerProcessStartInfo("/bin/sh", workingDirectory, logPath);

        return unixShell with { Arguments = "-c \"sleep 60\"" };
    }

    private static async Task WaitForAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);

        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException("Condition was not met within 10 seconds.");
            }

            await Task.Delay(50);
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~SystemProcessFactoryTests"`
Expected: build FAILS with "The type or namespace name 'SystemProcessFactory' could not be found".

- [ ] **Step 3: Write the implementation**

Create `launcher/Launcher/Server/ServerProcessStartInfo.cs`. Note the optional `Arguments` — the server itself takes no arguments, but the test shells need them:

```csharp
namespace Jukebox.Launcher.Server;

public sealed record ServerProcessStartInfo(
    string ExecutablePath,
    string WorkingDirectory,
    string LogFilePath)
{
    public string Arguments { get; init; } = string.Empty;
}
```

Create `launcher/Launcher/Server/IManagedProcess.cs`:

```csharp
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
```

Create `launcher/Launcher/Server/IProcessFactory.cs`:

```csharp
namespace Jukebox.Launcher.Server;

public interface IProcessFactory
{
    string? GetExecutablePath(int processId);

    void KillById(int processId);

    IManagedProcess Start(ServerProcessStartInfo startInfo);
}
```

Create `launcher/Launcher/Server/SystemProcessFactory.cs`:

```csharp
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public sealed class SystemProcessFactory : IProcessFactory
{
    public string? GetExecutablePath(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);

            return process.MainModule?.FileName;
        }
        catch (Exception error)
            when (error is ArgumentException or InvalidOperationException or Win32Exception)
        {
            return null;
        }
    }

    public void KillById(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);

            process.Kill(entireProcessTree: true);
            process.WaitForExit(5000);
        }
        catch (Exception error)
            when (error is ArgumentException or InvalidOperationException
                or NotSupportedException or Win32Exception)
        {
        }
    }

    public IManagedProcess Start(ServerProcessStartInfo startInfo)
    {
        var process = new Process
        {
            EnableRaisingEvents = true,
            StartInfo = new ProcessStartInfo
            {
                Arguments = startInfo.Arguments,
                CreateNoWindow = true,
                FileName = startInfo.ExecutablePath,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                WorkingDirectory = startInfo.WorkingDirectory,
            },
        };

        var logStream = new FileStream(
            startInfo.LogFilePath,
            FileMode.Append,
            FileAccess.Write,
            FileShare.Read);
        var logWriter = new StreamWriter(logStream) { AutoFlush = true };
        var logLock = new object();

        process.OutputDataReceived += (_, eventArguments) =>
            AppendLine(logWriter, logLock, eventArguments.Data);
        process.ErrorDataReceived += (_, eventArguments) =>
            AppendLine(logWriter, logLock, eventArguments.Data);

        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException(
                    $"Process did not start: {startInfo.ExecutablePath}.");
            }
        }
        catch
        {
            logWriter.Dispose();
            process.Dispose();
            throw;
        }

        process.BeginErrorReadLine();
        process.BeginOutputReadLine();

        return new SystemManagedProcess(process, logWriter);
    }

    private static void AppendLine(StreamWriter logWriter, object logLock, string? line)
    {
        if (line is null)
        {
            return;
        }

        lock (logLock)
        {
            try
            {
                logWriter.WriteLine(line);
            }
            catch (ObjectDisposedException)
            {
            }
        }
    }

    private sealed class SystemManagedProcess : IManagedProcess
    {
        private readonly StreamWriter logWriter;
        private readonly Process process;

        public SystemManagedProcess(Process process, StreamWriter logWriter)
        {
            this.process = process;
            this.logWriter = logWriter;
        }

        public int Id => process.Id;

        public void Dispose()
        {
            process.Dispose();
            logWriter.Dispose();
        }

        public void Kill()
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (Exception error)
                when (error is InvalidOperationException or NotSupportedException
                    or Win32Exception)
            {
            }
        }

        public bool TrySignalTerminate()
        {
            if (OperatingSystem.IsWindows())
            {
                return false;
            }

            try
            {
                using var kill = Process.Start(new ProcessStartInfo
                {
                    ArgumentList = { "-TERM", process.Id.ToString() },
                    CreateNoWindow = true,
                    FileName = "/bin/kill",
                    UseShellExecute = false,
                });

                if (kill is null)
                {
                    return false;
                }

                kill.WaitForExit(2000);

                return kill.ExitCode == 0;
            }
            catch (Exception error)
                when (error is InvalidOperationException or Win32Exception)
            {
                return false;
            }
        }

        public async Task<int> WaitForExitAsync(CancellationToken cancellationToken)
        {
            await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);

            return process.ExitCode;
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~SystemProcessFactoryTests"`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add launcher/Launcher/Server/ServerProcessStartInfo.cs launcher/Launcher/Server/IManagedProcess.cs launcher/Launcher/Server/IProcessFactory.cs launcher/Launcher/Server/SystemProcessFactory.cs launcher/Launcher.Tests/SystemProcessFactoryTests.cs
git commit -m "feat(launcher): add process abstraction over System.Diagnostics.Process"
```

---

### Task 4: ServerProcessManager — start, stop, PID file, orphan handling

The supervisor's lifecycle core, tested entirely with fakes. Crash-restart supervision is Task 5; in this task an unexpected exit simply reports `Stopped`.

**Files:**
- Create: `launcher/Launcher/Server/ServerProcessState.cs`
- Create: `launcher/Launcher/Server/ServerProcessStateChangedEventArgs.cs`
- Create: `launcher/Launcher/Server/IServerProcessManager.cs`
- Create: `launcher/Launcher/Server/IServerProcessGate.cs`
- Create: `launcher/Launcher/Server/ServerProcessManager.cs`
- Test: `launcher/Launcher.Tests/ServerProcessManagerTests.cs` (includes `FakeProcessFactory` / `FakeManagedProcess` helpers)

**Interfaces:**
- Consumes: `IServerInstallation` (Task 0 — exists), `IServerExecutableLocator` (Task 1), `IProcessFactory`, `IManagedProcess`, `ServerProcessStartInfo` (Task 3), `ServerLogFile.PrepareForStart` (Task 2).
- Produces:
  - `enum ServerProcessState { Failed, NotInstalled, Restarting, Running, Starting, Stopped }`
  - `ServerProcessStateChangedEventArgs` with `ServerProcessState State` and `string Detail`.
  - `IServerProcessManager` — `event EventHandler<ServerProcessStateChangedEventArgs>? StateChanged`, `ServerProcessState State { get; }`, `string StateDetail { get; }`, `Task StartAsync(CancellationToken)`, `Task StopAsync(CancellationToken)`.
  - `IServerProcessGate` — `Task StartAfterUpdateAsync(CancellationToken)`, `Task StopForUpdateAsync(CancellationToken)`.
  - `ServerProcessManager : IServerProcessManager, IServerProcessGate`. Full constructor for tests: `ServerProcessManager(IServerInstallation installation, IServerExecutableLocator executableLocator, IProcessFactory processFactory, Func<TimeSpan, CancellationToken, Task> delay, Func<DateTimeOffset> nowProvider, TimeSpan stopGracePeriod)`. Production constructor omits the last three (defaults `Task.Delay`, `() => DateTimeOffset.UtcNow`, 5 seconds).
  - The manager's data directory is `Path.GetDirectoryName(installation.InstallDirectory)`; the PID file is `server.pid` in it; the log path comes from `ServerLogFile.PrepareForStart(dataDirectory)`.

- [ ] **Step 1: Write the failing tests**

Create `launcher/Launcher.Tests/ServerProcessManagerTests.cs`:

```csharp
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

        public bool KillCalled { get; private set; }

        public bool TerminateSignalled { get; private set; }

        public void Dispose()
        {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~ServerProcessManagerTests"`
Expected: build FAILS with "The type or namespace name 'ServerProcessManager' could not be found".

- [ ] **Step 3: Write the implementation**

Create `launcher/Launcher/Server/ServerProcessState.cs`:

```csharp
namespace Jukebox.Launcher.Server;

public enum ServerProcessState
{
    Failed,
    NotInstalled,
    Restarting,
    Running,
    Starting,
    Stopped,
}
```

Create `launcher/Launcher/Server/ServerProcessStateChangedEventArgs.cs`:

```csharp
using System;

namespace Jukebox.Launcher.Server;

public sealed class ServerProcessStateChangedEventArgs : EventArgs
{
    public ServerProcessStateChangedEventArgs(ServerProcessState state, string detail)
    {
        State = state;
        Detail = detail;
    }

    public string Detail { get; }

    public ServerProcessState State { get; }
}
```

Create `launcher/Launcher/Server/IServerProcessManager.cs`:

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public interface IServerProcessManager
{
    event EventHandler<ServerProcessStateChangedEventArgs>? StateChanged;

    ServerProcessState State { get; }

    string StateDetail { get; }

    Task StartAsync(CancellationToken cancellationToken);

    Task StopAsync(CancellationToken cancellationToken);
}
```

Create `launcher/Launcher/Server/IServerProcessGate.cs`:

```csharp
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public interface IServerProcessGate
{
    Task StartAfterUpdateAsync(CancellationToken cancellationToken);

    Task StopForUpdateAsync(CancellationToken cancellationToken);
}
```

Create `launcher/Launcher/Server/ServerProcessManager.cs`. In this task `SuperviseAsync` only reports an unexpected exit; Task 5 adds restarts:

```csharp
using System;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public sealed class ServerProcessManager : IServerProcessManager, IServerProcessGate
{
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

            if (executablePath is not null
                && executablePath.StartsWith(
                    installation.InstallDirectory,
                    StringComparison.OrdinalIgnoreCase))
            {
                processFactory.KillById(processId);
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
        int exitCode;

        try
        {
            exitCode = await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        if (cancellationToken.IsCancellationRequested)
        {
            return;
        }

        lock (stateLock)
        {
            currentProcess = null;
        }

        DeletePidFile();
        SetState(
            ServerProcessState.Stopped,
            $"Server exited unexpectedly (code {exitCode}).");
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~ServerProcessManagerTests"`
Expected: 12 passed.

- [ ] **Step 5: Run the full suite to catch regressions**

Run: `dotnet test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add launcher/Launcher/Server/ServerProcessState.cs launcher/Launcher/Server/ServerProcessStateChangedEventArgs.cs launcher/Launcher/Server/IServerProcessManager.cs launcher/Launcher/Server/IServerProcessGate.cs launcher/Launcher/Server/ServerProcessManager.cs launcher/Launcher.Tests/ServerProcessManagerTests.cs
git commit -m "feat(launcher): add server process manager with start/stop and orphan handling"
```

---

### Task 5: Supervision — crash restart with backoff and give-up

Replace the exit handling in `SuperviseAsync` with a restart loop: backoff delays 1, 2, 5, 15, 30 seconds (repeating the last), give up after 5 crashes within a 2-minute rolling window.

**Files:**
- Modify: `launcher/Launcher/Server/ServerProcessManager.cs` (the `SuperviseAsync` method and new constants)
- Test: `launcher/Launcher.Tests/ServerProcessManagerTests.cs` (append tests)

**Interfaces:**
- Consumes: everything Task 4 produced; the injected `delay` and `nowProvider` make timing deterministic.
- Produces: no API changes — behavior only. `Restarting` state detail is `Server exited unexpectedly (code {exitCode}). Restarting…`; `Failed` give-up detail is the exact spec message.

- [ ] **Step 1: Write the failing tests**

Append inside the `ServerProcessManagerTests` class (before the `Workspace` helper class):

```csharp
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
```

Note for `KeepsBackoffLowWhenCrashesAreSpreadOut`: crashes 3 minutes apart always leave exactly one crash in the 2-minute window, so the delay index stays at 0 — the expectation is six 1-second delays. The escalation sequence itself is asserted in `GivesUpAfterFiveCrashesInWindow` (1, 2, 5, 15 seconds for crashes that stay in the window).

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~ServerProcessManagerTests"`
Expected: `RestartsAfterUnexpectedExit`, `GivesUpAfterFiveCrashesInWindow`, `FailsWhenRestartSpawnThrows`, and `GateStopAndStartRoundTrip` FAIL (no restart happens yet — the manager reports `Stopped` after an exit). `DeliberateStopSuppressesRestart` and `UsesEscalatingBackoffDelays` may pass or fail; that is fine.

- [ ] **Step 3: Replace SuperviseAsync with the supervision loop**

In `launcher/Launcher/Server/ServerProcessManager.cs`, add these constants near the top of the class (after the field declarations):

```csharp
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
```

Replace the entire `SuperviseAsync` method with:

```csharp
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
```

Add `using System.Collections.Generic;` to the file's usings.

One subtlety in `StopAsync`: the supervision loop may have replaced `currentProcess` since `StartAsync`. `StopAsync` already reads `currentProcess` fresh under the lock, so it terminates whichever process is current — but the loop can also be mid-restart with `currentProcess == null`. Cancelling the token before terminating covers that: the loop observes cancellation at its next await and exits without spawning again.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~ServerProcessManagerTests"`
Expected: 18 passed.

- [ ] **Step 5: Run the full suite**

Run: `dotnet test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add launcher/Launcher/Server/ServerProcessManager.cs launcher/Launcher.Tests/ServerProcessManagerTests.cs
git commit -m "feat(launcher): restart crashed server with backoff and give-up threshold"
```

---

### Task 6: Stop/start the server around installs in ServerUpdater

`ServerUpdater` gets an optional `IServerProcessGate`. It stops the server after download + extraction succeed (just before the directory swap) and restarts it afterwards — after success *or* rollback. When extraction fails, the gate is never touched.

**Files:**
- Modify: `launcher/Launcher/Server/ServerUpdater.cs`
- Test: `launcher/Launcher.Tests/ServerUpdaterTests.cs` (append tests + helper)

**Interfaces:**
- Consumes: `IServerProcessGate` (Task 4).
- Produces: both `ServerUpdater` constructors gain a trailing optional parameter `IServerProcessGate? processGate = null`. No other signature changes; a null gate preserves current behavior for all existing tests.

- [ ] **Step 1: Write the failing tests**

Append inside the `ServerUpdaterTests` class (before the private helpers):

```csharp
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
```

Then extend the existing `BuildUpdater` helper with the gate parameter — replace its signature and final return statement:

```csharp
    private static ServerUpdater BuildUpdater(
        string installDirectory,
        OSPlatform platform,
        Architecture architecture,
        LatestRelease release,
        string fixtureArchivePath,
        out UpdateStatusBus statusBus,
        IServerInstallation? installation = null,
        IServerProcessGate? processGate = null)
```

and

```csharp
        return new ServerUpdater(
            releaseClient.Object,
            new PlatformAssetSelector(platform, architecture),
            installation,
            downloader.Object,
            statusBus,
            () => new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            processGate);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~ServerUpdaterTests"`
Expected: build FAILS — `ServerUpdater` has no constructor taking a gate.

- [ ] **Step 3: Modify ServerUpdater**

In `launcher/Launcher/Server/ServerUpdater.cs`:

Add the field (with the other fields):

```csharp
    private readonly IServerProcessGate? processGate;
```

Change both constructors to accept the trailing optional parameter:

```csharp
    public ServerUpdater(
        IGitHubReleaseClient releaseClient,
        IPlatformAssetSelector platformSelector,
        IServerInstallation installation,
        IArchiveDownloader downloader,
        IUpdateStatusBus statusBus,
        IServerProcessGate? processGate = null)
        : this(
            releaseClient,
            platformSelector,
            installation,
            downloader,
            statusBus,
            () => DateTimeOffset.UtcNow,
            processGate)
    {
    }

    public ServerUpdater(
        IGitHubReleaseClient releaseClient,
        IPlatformAssetSelector platformSelector,
        IServerInstallation installation,
        IArchiveDownloader downloader,
        IUpdateStatusBus statusBus,
        Func<DateTimeOffset> nowProvider,
        IServerProcessGate? processGate = null)
```

and add to the second constructor's body:

```csharp
        this.processGate = processGate;
```

In `InstallAsync`, replace the section from `if (Directory.Exists(installDirectory))` through the final `CleanDirectory(downloadDirectory);` with:

```csharp
        var gate = processGate;

        if (gate is not null)
        {
            statusBus.Publish($"Restarting server for update to {latest.Version}…");
            await gate.StopForUpdateAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
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
        finally
        {
            if (gate is not null)
            {
                await gate.StartAfterUpdateAsync(CancellationToken.None).ConfigureAwait(false);
            }
        }
```

The restart in `finally` deliberately uses `CancellationToken.None`: even when the update is being cancelled or has failed after the stop, the server must come back up with whichever install directory now exists.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~ServerUpdaterTests"`
Expected: 10 passed (7 existing + 3 new).

- [ ] **Step 5: Run the full suite**

Run: `dotnet test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add launcher/Launcher/Server/ServerUpdater.cs launcher/Launcher.Tests/ServerUpdaterTests.cs
git commit -m "feat(launcher): stop and restart server around update installs"
```

---

### Task 7: Server state in the About window

`AboutViewModel` subscribes to `IServerProcessManager.StateChanged` and exposes `ServerStateDisplay`; the window gets one new row.

**Files:**
- Modify: `launcher/Launcher/ViewModels/AboutViewModel.cs`
- Modify: `launcher/Launcher/Views/AboutWindow.axaml`
- Test: `launcher/Launcher.Tests/AboutViewModelTests.cs`, `launcher/Launcher.Tests/AboutWindowRenderingTests.cs` (append tests)

**Interfaces:**
- Consumes: `IServerProcessManager`, `ServerProcessState`, `ServerProcessStateChangedEventArgs` (Task 4).
- Produces: the 5-parameter `AboutViewModel` constructor gains a trailing optional `IServerProcessManager? processManager = null`; new property `string ServerStateDisplay`. Display mapping: `NotInstalled` → empty, `Starting` → `Server starting…`, `Running` → `Server running`, `Restarting` → `Server restarting…`, `Stopped` → `Server stopped`, `Failed` → the detail message verbatim.

- [ ] **Step 1: Write the failing tests**

Append inside the `AboutViewModelTests` class:

```csharp
    [Fact]
    public void ShowsServerStateFromManager()
    {
        var manager = new FakeServerProcessManager(
            ServerProcessState.Running,
            "Server running");

        using var viewModel = new AboutViewModel("1.0.0", null, null, null, null, manager);

        Assert.Equal("Server running", viewModel.ServerStateDisplay);
    }

    [Fact]
    public void ShowsEmptyServerStateWithoutManager()
    {
        using var viewModel = new AboutViewModel("1.0.0", null, null, null, null);

        Assert.Equal(string.Empty, viewModel.ServerStateDisplay);
    }

    [Fact]
    public void UpdatesServerStateWhenManagerRaisesEvent()
    {
        var manager = new FakeServerProcessManager(
            ServerProcessState.Starting,
            "Server starting…");

        using var viewModel = new AboutViewModel("1.0.0", null, null, null, null, manager);

        manager.Raise(ServerProcessState.Failed, "Couldn't start the server: nope. Check the log at /tmp/server.log.");

        Assert.Equal(
            "Couldn't start the server: nope. Check the log at /tmp/server.log.",
            viewModel.ServerStateDisplay);
    }

    [Fact]
    public void DisposeUnsubscribesFromManager()
    {
        var manager = new FakeServerProcessManager(
            ServerProcessState.Running,
            "Server running");

        var viewModel = new AboutViewModel("1.0.0", null, null, null, null, manager);

        viewModel.Dispose();

        manager.Raise(ServerProcessState.Stopped, "Server stopped");

        Assert.Equal("Server running", viewModel.ServerStateDisplay);
    }

    internal sealed class FakeServerProcessManager : IServerProcessManager
    {
        public FakeServerProcessManager(ServerProcessState state, string stateDetail)
        {
            State = state;
            StateDetail = stateDetail;
        }

        public event EventHandler<ServerProcessStateChangedEventArgs>? StateChanged;

        public ServerProcessState State { get; private set; }

        public string StateDetail { get; private set; }

        public void Raise(ServerProcessState state, string detail)
        {
            State = state;
            StateDetail = detail;
            StateChanged?.Invoke(this, new ServerProcessStateChangedEventArgs(state, detail));
        }

        public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
```

Add the needed usings to `AboutViewModelTests.cs` if not present: `System.Threading`, `System.Threading.Tasks`.

Append inside `AboutWindowRenderingTests`:

```csharp
    [AvaloniaFact]
    public void ServerStateLineUpdatesWhenManagerRaisesEvent()
    {
        var manager = new AboutViewModelTests.FakeServerProcessManager(
            ServerProcessState.Starting,
            "Server starting…");
        var viewModel = new AboutViewModel("1.0.0", null, null, null, null, manager);

        var window = new AboutWindow { DataContext = viewModel };

        window.Show();

        Assert.Equal("Server starting…", window.GetByTestId<TextBlock>("about-server-state").Text);

        manager.Raise(ServerProcessState.Running, "Server running");
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("Server running", window.GetByTestId<TextBlock>("about-server-state").Text);

        window.Close();
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter "FullyQualifiedName~AboutViewModelTests|FullyQualifiedName~AboutWindowRenderingTests"`
Expected: build FAILS — no 6-parameter constructor, no `ServerStateDisplay`.

- [ ] **Step 3: Modify AboutViewModel**

In `launcher/Launcher/ViewModels/AboutViewModel.cs`:

Add fields:

```csharp
    private readonly IServerProcessManager? processManager;

    private string serverState;
```

Change the 5-parameter constructor to take the manager and initialize/subscribe (full replacement of the constructor):

```csharp
    public AboutViewModel(
        string launcherInstalled,
        string? launcherLatest,
        InstalledServer? installedServer,
        LatestRelease? latestServer,
        IUpdateStatusBus? statusBus,
        IServerProcessManager? processManager = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(launcherInstalled);

        LauncherInstalled = launcherInstalled;
        this.launcherLatest = FormatLauncherLatest(launcherLatest);
        serverInstalled = FormatServerInstalled(installedServer);
        serverLatest = FormatServerLatest(latestServer);
        serverState = processManager is null
            ? string.Empty
            : FormatServerState(processManager.State, processManager.StateDetail);
        status = statusBus?.Status ?? string.Empty;

        this.processManager = processManager;
        this.statusBus = statusBus;

        if (statusBus is not null)
        {
            statusBus.StatusChanged += OnStatusChanged;
            statusBus.LatestServerChanged += OnLatestServerChanged;
        }

        if (processManager is not null)
        {
            processManager.StateChanged += OnServerStateChanged;
        }
    }
```

Add the property (with the other display properties, alphabetical):

```csharp
    public string ServerStateDisplay => serverState;
```

Extend `Dispose`:

```csharp
    public void Dispose()
    {
        if (statusBus is not null)
        {
            statusBus.StatusChanged -= OnStatusChanged;
            statusBus.LatestServerChanged -= OnLatestServerChanged;
        }

        if (processManager is not null)
        {
            processManager.StateChanged -= OnServerStateChanged;
        }
    }
```

Add the formatter and handler (with the other private members):

```csharp
    private static string FormatServerState(ServerProcessState state, string detail)
    {
        return state switch
        {
            ServerProcessState.Failed => detail,
            ServerProcessState.NotInstalled => string.Empty,
            ServerProcessState.Restarting => "Server restarting…",
            ServerProcessState.Running => "Server running",
            ServerProcessState.Starting => "Server starting…",
            ServerProcessState.Stopped => "Server stopped",
            _ => string.Empty,
        };
    }

    private void OnServerStateChanged(object? sender, ServerProcessStateChangedEventArgs eventArguments)
    {
        var formattedState = FormatServerState(eventArguments.State, eventArguments.Detail);

        RunOnUiThread(() =>
        {
            serverState = formattedState;
            RaisePropertyChanged(nameof(ServerStateDisplay));
        });
    }
```

- [ ] **Step 4: Modify AboutWindow.axaml**

In `launcher/Launcher/Views/AboutWindow.axaml`, change `Height="280"` to `Height="300"` and insert after the `about-status` TextBlock:

```xml
        <TextBlock AutomationProperties.AutomationId="about-server-state"
                   Text="{Binding ServerStateDisplay}"
                   TextWrapping="Wrap"
                   Opacity="0.7" />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~AboutViewModelTests|FullyQualifiedName~AboutWindowRenderingTests"`
Expected: all pass.

- [ ] **Step 6: Run the full suite**

Run: `dotnet test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add launcher/Launcher/ViewModels/AboutViewModel.cs launcher/Launcher/Views/AboutWindow.axaml launcher/Launcher.Tests/AboutViewModelTests.cs launcher/Launcher.Tests/AboutWindowRenderingTests.cs
git commit -m "feat(launcher): show live server state in the About window"
```

---

### Task 8: Wire everything together and verify end-to-end

DI registrations, app startup/shutdown, LauncherActions passing the manager to the About window, and a manual smoke test.

**Files:**
- Modify: `launcher/Launcher/Program.cs`
- Modify: `launcher/Launcher/App.axaml.cs`
- Modify: `launcher/Launcher/LauncherActions.cs`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: `LauncherActions` 4-parameter constructor gains a trailing optional `IServerProcessManager? processManager = null`. `ServerProcessManager` is registered once and exposed as both `IServerProcessManager` and `IServerProcessGate`.

- [ ] **Step 1: Register services in Program.cs**

In `launcher/Launcher/Program.cs`, inside `ConfigureServices`, insert after the `IServerInstallation` registration:

```csharp
        services.AddSingleton<IServerExecutableLocator>(serviceProvider =>
            new ServerExecutableLocator(serviceProvider.GetRequiredService<IServerInstallation>()));
        services.AddSingleton<IProcessFactory, SystemProcessFactory>();
        services.AddSingleton<ServerProcessManager>(serviceProvider => new ServerProcessManager(
            serviceProvider.GetRequiredService<IServerInstallation>(),
            serviceProvider.GetRequiredService<IServerExecutableLocator>(),
            serviceProvider.GetRequiredService<IProcessFactory>()));
        services.AddSingleton<IServerProcessManager>(serviceProvider =>
            serviceProvider.GetRequiredService<ServerProcessManager>());
        services.AddSingleton<IServerProcessGate>(serviceProvider =>
            serviceProvider.GetRequiredService<ServerProcessManager>());
```

and change the `IServerUpdater` registration to pass the gate:

```csharp
        services.AddSingleton<IServerUpdater>(serviceProvider => new ServerUpdater(
            serviceProvider.GetRequiredService<IGitHubReleaseClient>(),
            serviceProvider.GetRequiredService<IPlatformAssetSelector>(),
            serviceProvider.GetRequiredService<IServerInstallation>(),
            serviceProvider.GetRequiredService<IArchiveDownloader>(),
            serviceProvider.GetRequiredService<IUpdateStatusBus>(),
            serviceProvider.GetRequiredService<IServerProcessGate>()));
```

Note: the second-to-last `ServerUpdater` constructor argument is `statusBus` — keep the argument order matching the constructor from Task 6 (`releaseClient, platformSelector, installation, downloader, statusBus, processGate`).

- [ ] **Step 2: Pass the manager through LauncherActions**

In `launcher/Launcher/LauncherActions.cs`, add the field, extend the second constructor, and pass the manager to the view model:

```csharp
    private readonly IServerProcessManager? processManager;
```

```csharp
    public LauncherActions(
        IClassicDesktopStyleApplicationLifetime lifetime,
        IVersionProvider versionProvider,
        IServerInstallation? serverInstallation,
        IUpdateStatusBus? statusBus,
        IServerProcessManager? processManager = null)
    {
        this.lifetime = lifetime;
        this.versionProvider = versionProvider;
        this.serverInstallation = serverInstallation;
        this.statusBus = statusBus;
        this.processManager = processManager;
    }
```

and in `ShowAbout`, pass it as the sixth argument:

```csharp
            DataContext = new AboutViewModel(
                versionProvider.Current,
                latestServer?.Version,
                installedServer,
                latestServer,
                statusBus,
                processManager),
```

- [ ] **Step 3: Start and stop the server in App.axaml.cs**

In `launcher/Launcher/App.axaml.cs`, resolve the manager and wire it in `OnFrameworkInitializationCompleted` — replace the body of the `if (ApplicationLifetime is ...)` block:

```csharp
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            var versionProvider = Services.GetRequiredService<IVersionProvider>();
            var serverInstallation = Services.GetService<IServerInstallation>();
            var statusBus = Services.GetService<IUpdateStatusBus>();
            var processManager = Services.GetService<IServerProcessManager>();

            actions = new LauncherActions(
                desktop,
                versionProvider,
                serverInstallation,
                statusBus,
                processManager);

            TryEnableAutostart();
            StartServer(desktop, processManager);
            StartBackgroundUpdateCheck(desktop);
```

Add the method (next to `StartBackgroundUpdateCheck`):

```csharp
    private static void StartServer(
        IClassicDesktopStyleApplicationLifetime desktop,
        IServerProcessManager? processManager)
    {
        if (processManager is null)
        {
            return;
        }

        desktop.ShutdownRequested += (_, _) =>
        {
            try
            {
                processManager
                    .StopAsync(CancellationToken.None)
                    .Wait(TimeSpan.FromSeconds(5));
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"Could not stop the server cleanly: {error.Message}");
            }
        };

        _ = Task.Run(async () =>
        {
            try
            {
                await processManager.StartAsync(CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"Could not start the server: {error.Message}");
            }
        });
    }
```

- [ ] **Step 4: Build and run the full suite**

Run: `dotnet build && dotnet test`
Expected: build succeeds, all tests pass.

- [ ] **Step 5: Manual end-to-end verification**

1. Run `dotnet run --project Launcher` (from `launcher/`). If no `JukeboxLauncher` instance is already running, the tray icon appears.
2. Wait for the update check to install the server (first run) or confirm up-to-date. Open **About Jukebox** from the tray: the status line shows the update outcome and the new server-state line shows `Server running`.
3. Verify the server responds: open `http://localhost:1990` in a browser.
4. Verify the log file exists under the Jukebox data root (`%LocalAppData%\Jukebox\logs\server.log` on Windows).
5. Kill the server process in Task Manager (`jukebox-media-server`): the About window shows `Server restarting…` and then `Server running` again; the site responds again.
6. Quit the launcher from the tray: the `jukebox-media-server` process disappears and `server.pid` is gone.

- [ ] **Step 6: Commit**

```bash
git add launcher/Launcher/Program.cs launcher/Launcher/App.axaml.cs launcher/Launcher/LauncherActions.cs
git commit -m "feat(launcher): start installed server on launch and stop on quit"
```
