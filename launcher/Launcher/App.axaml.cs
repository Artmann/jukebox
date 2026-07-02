using System;
using System.Threading;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Jukebox.Launcher.Autostart;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;
using Microsoft.Extensions.DependencyInjection;

namespace Jukebox.Launcher;

public partial class App : Application
{
    private static IServiceProvider? configuredServices;

    private LauncherActions? actions;
    private CancellationTokenSource? updateCheckCancellation;

    public App()
    {
        Services = configuredServices ?? Program.BuildServiceProvider();
    }

    public IServiceProvider Services { get; }

    public static void ConfigureServices(IServiceProvider services)
    {
        configuredServices = services;
    }

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            var versionProvider = Services.GetRequiredService<IVersionProvider>();
            var serverInstallation = Services.GetService<IServerInstallation>();
            var statusBus = Services.GetService<IUpdateStatusBus>();

            actions = new LauncherActions(desktop, versionProvider, serverInstallation, statusBus);

            TryEnableAutostart();
            StartBackgroundUpdateCheck(desktop);
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void StartBackgroundUpdateCheck(IClassicDesktopStyleApplicationLifetime desktop)
    {
        var updater = Services.GetService<IServerUpdater>();

        if (updater is null)
        {
            return;
        }

        updateCheckCancellation = new CancellationTokenSource();
        desktop.ShutdownRequested += (_, _) => updateCheckCancellation?.Cancel();

        var token = updateCheckCancellation.Token;

        _ = Task.Run(
            async () =>
            {
                try
                {
                    await updater.UpdateIfNewerAsync(token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                }
                catch (Exception error)
                {
                    Console.Error.WriteLine($"Background update check failed: {error.Message}");
                }
            },
            token);
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
}
