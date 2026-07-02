namespace Jukebox.Launcher.Server;

public interface IProcessFactory
{
    string? GetExecutablePath(int processId);

    void KillById(int processId);

    IManagedProcess Start(ServerProcessStartInfo startInfo);
}
