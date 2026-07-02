using Jukebox.Launcher.Updates;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class SemVerComparerTests
{
    [Theory]
    [InlineData("0.5.1", "0.5.0", true)]
    [InlineData("0.5.1", "0.5.1", false)]
    [InlineData("0.5.0", "0.5.1", false)]
    [InlineData("1.0.0", "0.99.99", true)]
    [InlineData("0.5.1", "0.5.1-beta.1", true)]
    [InlineData("0.5.1-beta.2", "0.5.1-beta.1", true)]
    public void IsNewerCompares(string candidate, string baseline, bool expectedNewer)
    {
        Assert.Equal(expectedNewer, SemVerComparer.IsNewer(candidate, baseline));
    }

    [Theory]
    [InlineData("0.5.1", true)]
    [InlineData("0.5.1-beta.1", true)]
    [InlineData("0.5.1+build.7", true)]
    [InlineData("not-a-version", false)]
    [InlineData("", false)]
    [InlineData("1.2", false)]
    public void IsValidRecognisesSemver(string value, bool valid)
    {
        Assert.Equal(valid, SemVerComparer.IsValid(value));
    }
}
