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
