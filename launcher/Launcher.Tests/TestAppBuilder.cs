using Avalonia;
using Avalonia.Headless;
using Jukebox.Launcher;
using Jukebox.Launcher.Tests;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace Jukebox.Launcher.Tests;

public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions());
}
