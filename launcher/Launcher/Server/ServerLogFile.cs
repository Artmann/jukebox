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
