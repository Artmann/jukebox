using Avalonia;
using Avalonia.Headless;
using Jukebox.Launcher;
using Jukebox.Launcher.Autostart;
using Jukebox.Launcher.Tests;
using Microsoft.Extensions.DependencyInjection;
using Moq;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace Jukebox.Launcher.Tests;

public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp()
    {
        var versionProvider = new Mock<IVersionProvider>();
        versionProvider.SetupGet(provider => provider.Current).Returns("0.0.0-test");

        var services = new ServiceCollection();
        services.AddSingleton(versionProvider.Object);
        services.AddSingleton<IAutostartService>(new NoopAutostartService());

        App.ConfigureServices(services.BuildServiceProvider());

        return AppBuilder.Configure<App>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = true });
    }
}
