using System;
using System.Net.Http;
using Avalonia;
using Avalonia.Controls;
using Jukebox.Launcher.Autostart;
using Jukebox.Launcher.Server;
using Jukebox.Launcher.Updates;
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
        services.AddSingleton<HttpClient>(serviceProvider => CreateHttpClient(serviceProvider));
        services.AddSingleton<IGitHubReleaseClient>(serviceProvider =>
            new GitHubReleaseClient(serviceProvider.GetRequiredService<HttpClient>()));
        services.AddSingleton<IPlatformAssetSelector>(_ => new PlatformAssetSelector());
        services.AddSingleton<IServerInstallation>(_ => ServerInstallationFactory.Create());
        services.AddSingleton<IServerExecutableLocator>(serviceProvider =>
            new ServerExecutableLocator(serviceProvider.GetRequiredService<IServerInstallation>()));
        services.AddSingleton<IProcessFactory, SystemProcessFactory>();
        services.AddSingleton<ServerProcessManager>(serviceProvider => new ServerProcessManager(
            serviceProvider.GetRequiredService<IServerInstallation>(),
            serviceProvider.GetRequiredService<IServerExecutableLocator>(),
            serviceProvider.GetRequiredService<IProcessFactory>()));
        services.AddSingleton<IServerProcessManager>(serviceProvider =>
            serviceProvider.GetRequiredService<ServerProcessManager>());
        services.AddSingleton<IServerProcessGate>(serviceProvider =>
            serviceProvider.GetRequiredService<ServerProcessManager>());
        services.AddSingleton<IUpdateStatusBus, UpdateStatusBus>();
        services.AddSingleton<IArchiveDownloader>(serviceProvider =>
            new HttpArchiveDownloader(serviceProvider.GetRequiredService<HttpClient>()));
        services.AddSingleton<IServerUpdater>(serviceProvider => new ServerUpdater(
            serviceProvider.GetRequiredService<IGitHubReleaseClient>(),
            serviceProvider.GetRequiredService<IPlatformAssetSelector>(),
            serviceProvider.GetRequiredService<IServerInstallation>(),
            serviceProvider.GetRequiredService<IArchiveDownloader>(),
            serviceProvider.GetRequiredService<IUpdateStatusBus>(),
            serviceProvider.GetRequiredService<IServerProcessGate>()));
    }

    private static HttpClient CreateHttpClient(IServiceProvider serviceProvider)
    {
        var version = serviceProvider.GetRequiredService<IVersionProvider>().Current;
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30),
        };

        client.DefaultRequestHeaders.UserAgent.ParseAdd($"JukeboxLauncher/{version}");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");

        return client;
    }
}
