using Avalonia;
using Avalonia.Headless;
using Jukebox.Launcher;
using Jukebox.Launcher.Autostart;
using Jukebox.Launcher.Tests;
using Microsoft.Extensions.DependencyInjection;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace Jukebox.Launcher.Tests;

public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp()
    {
        var services = new ServiceCollection();

        services.AddSingleton<IVersionProvider>(new StubVersionProvider("0.0.0-test"));
        services.AddSingleton<IAutostartService>(new NoopAutostartService());

        App.ConfigureServices(services.BuildServiceProvider());

        return AppBuilder.Configure<App>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions());
    }
}

internal sealed class StubVersionProvider : IVersionProvider
{
    public StubVersionProvider(string version) => Current = version;

    public string Current { get; }
}
