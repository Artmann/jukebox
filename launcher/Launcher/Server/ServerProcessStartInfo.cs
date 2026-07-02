namespace Jukebox.Launcher.Server;

public sealed record ServerProcessStartInfo(
    string ExecutablePath,
    string WorkingDirectory,
    string LogFilePath)
{
    public string Arguments { get; init; } = string.Empty;
}
