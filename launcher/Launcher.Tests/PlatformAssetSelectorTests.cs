using System.Collections.Generic;
using System.Runtime.InteropServices;
using Jukebox.Launcher.Updates;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class PlatformAssetSelectorTests
{
    private static LatestRelease BuildRelease()
    {
        return new LatestRelease(
            "jukebox-media-server-v0.5.1",
            "0.5.1",
            new List<ReleaseAsset>
            {
                new("jukebox-media-server-windows-x64.zip", "https://example/win.zip", 100),
                new("jukebox-media-server-darwin-arm64.tar.gz", "https://example/mac.tar.gz", 200),
                new("jukebox-media-server-linux-x64.tar.gz", "https://example/linux.tar.gz", 300),
            });
    }

    [Fact]
    public void PicksWindowsX64Archive()
    {
        var selector = new PlatformAssetSelector(OSPlatform.Windows, Architecture.X64);
        var asset = selector.SelectAsset(BuildRelease());

        Assert.NotNull(asset);
        Assert.Equal("jukebox-media-server-windows-x64.zip", asset!.Name);
        Assert.Equal("windows-x64", selector.PlatformDescription);
    }

    [Fact]
    public void PicksMacArm64Archive()
    {
        var selector = new PlatformAssetSelector(OSPlatform.OSX, Architecture.Arm64);
        var asset = selector.SelectAsset(BuildRelease());

        Assert.NotNull(asset);
        Assert.Equal("jukebox-media-server-darwin-arm64.tar.gz", asset!.Name);
        Assert.Equal("darwin-arm64", selector.PlatformDescription);
    }

    [Fact]
    public void PicksLinuxX64Archive()
    {
        var selector = new PlatformAssetSelector(OSPlatform.Linux, Architecture.X64);
        var asset = selector.SelectAsset(BuildRelease());

        Assert.NotNull(asset);
        Assert.Equal("jukebox-media-server-linux-x64.tar.gz", asset!.Name);
        Assert.Equal("linux-x64", selector.PlatformDescription);
    }

    [Fact]
    public void ReturnsNullForUnsupportedCombination()
    {
        var selector = new PlatformAssetSelector(OSPlatform.Linux, Architecture.Arm64);
        var asset = selector.SelectAsset(BuildRelease());

        Assert.Null(asset);
        Assert.Equal("linux-arm64", selector.PlatformDescription);
    }

    [Fact]
    public void ReturnsNullWhenReleaseHasNoMatchingAsset()
    {
        var release = new LatestRelease(
            "jukebox-media-server-v0.5.1",
            "0.5.1",
            new List<ReleaseAsset>
            {
                new("jukebox-media-server-darwin-arm64.tar.gz", "https://example", 1),
            });

        var selector = new PlatformAssetSelector(OSPlatform.Windows, Architecture.X64);

        Assert.Null(selector.SelectAsset(release));
    }
}
