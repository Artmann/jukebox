using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Jukebox.Launcher.Autostart;
using Microsoft.Extensions.DependencyInjection;

namespace Jukebox.Launcher;

public partial class App : Application
{
    private LauncherActions? actions;

    public App() : this(BuildFallbackServices())
    {
    }

    public App(IServiceProvider services)
    {
        Services = services;
    }

    public IServiceProvider Services { get; }

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            var versionProvider = Services.GetRequiredService<IVersionProvider>();
            actions = new LauncherActions(desktop, versionProvider);

            TryEnableAutostart();
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void TryEnableAutostart()
    {
        try
        {
            Services.GetRequiredService<IAutostartService>().Enable();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Autostart could not be enabled: {error.Message}");
        }
    }

    private void OnAboutClicked(object? sender, EventArgs eventArguments) => actions?.ShowAbout();

    private void OnQuitClicked(object? sender, EventArgs eventArguments) => actions?.Quit();

    private static IServiceProvider BuildFallbackServices() => Program.BuildServiceProvider();
}
