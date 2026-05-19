using Jukebox.Launcher.ViewModels;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AboutViewModelTests
{
    [Fact]
    public void ExposesVersionAndDisplayString()
    {
        var viewModel = new AboutViewModel("1.2.3");

        Assert.Equal("1.2.3", viewModel.Version);
        Assert.Equal("Version 1.2.3", viewModel.VersionDisplay);
    }

    [Fact]
    public void SupportsPrereleaseTags()
    {
        var viewModel = new AboutViewModel("0.5.1-beta.1");

        Assert.Equal("0.5.1-beta.1", viewModel.Version);
        Assert.Equal("Version 0.5.1-beta.1", viewModel.VersionDisplay);
    }

    [Fact]
    public void RejectsEmptyVersion()
    {
        Assert.Throws<System.ArgumentException>(() => new AboutViewModel(" "));
    }
}
