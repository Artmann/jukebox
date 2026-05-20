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
        var lifetime = new Mock<IClassicDesktopStyleApplicationLifetime>();

        var versionProvider = new Mock<IVersionProvider>();
        versionProvider.SetupGet(provider => provider.Current).Returns("7.7.7");

        var actions = new LauncherActions(lifetime.Object, versionProvider.Object);

        var window = actions.ShowAbout();

        Assert.NotNull(window);
        Assert.IsType<AboutWindow>(window);
        Assert.Equal("About Jukebox", window.Title);

        window.Close();
    }

    [AvaloniaFact]
    public void ShowAboutBindsVersionFromProvider()
    {
        var lifetime = new Mock<IClassicDesktopStyleApplicationLifetime>();

        var versionProvider = new Mock<IVersionProvider>();
        versionProvider.SetupGet(provider => provider.Current).Returns("4.2.0");

        var actions = new LauncherActions(lifetime.Object, versionProvider.Object);

        var window = actions.ShowAbout();

        versionProvider.VerifyGet(provider => provider.Current, Times.AtLeastOnce);

        window.Close();
    }

    [AvaloniaFact]
    public void QuitInvokesLifetimeShutdown()
    {
        var lifetime = new Mock<IClassicDesktopStyleApplicationLifetime>();

        var versionProvider = new Mock<IVersionProvider>();
        versionProvider.SetupGet(provider => provider.Current).Returns("1.0.0");

        var actions = new LauncherActions(lifetime.Object, versionProvider.Object);

        actions.Quit();

        lifetime.Verify(target => target.Shutdown(0), Times.Once);
    }
}
