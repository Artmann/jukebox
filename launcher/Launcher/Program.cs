using System;
using Avalonia;
using Avalonia.Controls;

namespace Jukebox.Launcher;

internal static class Program
{
    [STAThread]
    public static void Main(string[] arguments)
        => BuildAvaloniaApp().StartWithClassicDesktopLifetime(arguments, ShutdownMode.OnExplicitShutdown);

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
