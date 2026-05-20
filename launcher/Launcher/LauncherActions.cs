using Avalonia.Controls.ApplicationLifetimes;
using Jukebox.Launcher.ViewModels;
using Jukebox.Launcher.Views;

namespace Jukebox.Launcher;

public sealed class LauncherActions
{
    private readonly IClassicDesktopStyleApplicationLifetime lifetime;
    private readonly IVersionProvider versionProvider;

    public LauncherActions(
        IClassicDesktopStyleApplicationLifetime lifetime,
        IVersionProvider versionProvider)
    {
        this.lifetime = lifetime;
        this.versionProvider = versionProvider;
    }

    public AboutWindow ShowAbout()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel(versionProvider.Current),
        };

        window.Show();

        return window;
    }

    public void Quit() => lifetime.Shutdown();
}
