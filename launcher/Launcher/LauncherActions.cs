using Avalonia.Controls.ApplicationLifetimes;
using Jukebox.Launcher.ViewModels;
using Jukebox.Launcher.Views;

namespace Jukebox.Launcher;

public sealed class LauncherActions
{
    private readonly IClassicDesktopStyleApplicationLifetime lifetime;
    private readonly string version;

    public LauncherActions(IClassicDesktopStyleApplicationLifetime lifetime, string version)
    {
        this.lifetime = lifetime;
        this.version = version;
    }

    public AboutWindow ShowAbout()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel(version),
        };

        window.Show();

        return window;
    }

    public void Quit() => lifetime.Shutdown();
}
