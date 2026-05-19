using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Headless.XUnit;
using Jukebox.Launcher.Views;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class MenuActionInvocationTests
{
    [AvaloniaFact]
    public void ShowAboutOpensAnAboutWindow()
    {
        var lifetime = (IClassicDesktopStyleApplicationLifetime)Application.Current!.ApplicationLifetime!;
        var actions = new LauncherActions(lifetime, "7.7.7");

        var openBefore = lifetime.Windows.OfType<AboutWindow>().Count();

        var window = actions.ShowAbout();

        var openAfter = lifetime.Windows.OfType<AboutWindow>().Count();

        Assert.Equal(openBefore + 1, openAfter);
        Assert.Equal("About Jukebox", window.Title);

        window.Close();
    }
}
