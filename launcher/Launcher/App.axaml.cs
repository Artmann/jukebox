using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Jukebox.Launcher.Autostart;

namespace Jukebox.Launcher;

public partial class App : Application
{
    private LauncherActions? actions;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            actions = new LauncherActions(desktop, VersionProvider.Current);

            TryEnableAutostart();
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static void TryEnableAutostart()
    {
        try
        {
            AutostartServiceFactory.Create().Enable();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Autostart could not be enabled: {error.Message}");
        }
    }

    private void OnAboutClicked(object? sender, EventArgs eventArguments) => actions?.ShowAbout();

    private void OnQuitClicked(object? sender, EventArgs eventArguments) => actions?.Quit();
}
