using System;
using Avalonia;
using Avalonia.Controls;
using Jukebox.Launcher.Autostart;
using Microsoft.Extensions.DependencyInjection;

namespace Jukebox.Launcher;

internal static class Program
{
    [STAThread]
    public static void Main(string[] arguments)
    {
        var services = BuildServiceProvider();

        BuildAvaloniaApp(services)
            .StartWithClassicDesktopLifetime(arguments, ShutdownMode.OnExplicitShutdown);
    }

    public static AppBuilder BuildAvaloniaApp()
        => BuildAvaloniaApp(BuildServiceProvider());

    public static AppBuilder BuildAvaloniaApp(IServiceProvider services)
        => AppBuilder.Configure(() => new App(services))
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();

    public static IServiceProvider BuildServiceProvider()
    {
        var services = new ServiceCollection();

        ConfigureServices(services);

        return services.BuildServiceProvider();
    }

    public static void ConfigureServices(IServiceCollection services)
    {
        services.AddSingleton<IVersionProvider, AssemblyVersionProvider>();
        services.AddSingleton<IAutostartService>(_ => AutostartServiceFactory.Create());
    }
}
