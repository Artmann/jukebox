using System.Linq;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Headless.XUnit;
using Jukebox.Launcher;
using Jukebox.Launcher.Views;
using Moq;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class MenuActionInvocationTests
{
    [AvaloniaFact]
    public void ShowAboutOpensAnAboutWindow()
    {
        var lifetime = (IClassicDesktopStyleApplicationLifetime)Application.Current!.ApplicationLifetime!;

        var versionProvider = new Mock<IVersionProvider>();
        versionProvider.SetupGet(provider => provider.Current).Returns("7.7.7");

        var actions = new LauncherActions(lifetime, versionProvider.Object);

        var openBefore = lifetime.Windows.OfType<AboutWindow>().Count();

        var window = actions.ShowAbout();

        var openAfter = lifetime.Windows.OfType<AboutWindow>().Count();

        Assert.Equal(openBefore + 1, openAfter);
        Assert.Equal("About Jukebox", window.Title);

        window.Close();
    }

    [AvaloniaFact]
    public void ShowAboutBindsVersionFromProvider()
    {
        var lifetime = (IClassicDesktopStyleApplicationLifetime)Application.Current!.ApplicationLifetime!;

        var versionProvider = new Mock<IVersionProvider>();
        versionProvider.SetupGet(provider => provider.Current).Returns("4.2.0");

        var actions = new LauncherActions(lifetime, versionProvider.Object);

        var window = actions.ShowAbout();

        versionProvider.VerifyGet(provider => provider.Current, Times.AtLeastOnce);

        window.Close();
    }
}
