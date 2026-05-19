namespace Jukebox.Launcher.Autostart;

public sealed class NoopAutostartService : IAutostartService
{
    public bool IsEnabled() => false;

    public void Enable()
    {
    }

    public void Disable()
    {
    }
}
