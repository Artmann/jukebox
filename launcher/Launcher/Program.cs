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
        App.ConfigureServices(BuildServiceProvider());

        BuildAvaloniaApp()
            .StartWithClassicDesktopLifetime(arguments, ShutdownMode.OnExplicitShutdown);
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
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
