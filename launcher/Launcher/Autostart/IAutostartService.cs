namespace Jukebox.Launcher.Autostart;

public interface IAutostartService
{
    bool IsEnabled();

    void Enable();

    void Disable();
}
