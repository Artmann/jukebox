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
