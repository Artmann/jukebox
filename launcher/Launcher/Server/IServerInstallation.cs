namespace Jukebox.Launcher.Server;

public interface IServerInstallation
{
    string InstallDirectory { get; }

    InstalledServer? GetInstalled();

    void WriteInstalled(InstalledServer installed);
}
