using System;
using System.Linq;
using System.Runtime.InteropServices;

namespace Jukebox.Launcher.Updates;

public sealed class PlatformAssetSelector : IPlatformAssetSelector
{
    private readonly string assetName;

    public PlatformAssetSelector()
        : this(RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? OSPlatform.Windows
            : RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? OSPlatform.OSX
            : RuntimeInformation.IsOSPlatform(OSPlatform.Linux) ? OSPlatform.Linux
            : OSPlatform.Create("unknown"),
            RuntimeInformation.OSArchitecture)
    {
    }

    public PlatformAssetSelector(OSPlatform platform, Architecture architecture)
    {
        PlatformDescription = DescribePlatform(platform, architecture);
        assetName = ResolveAssetName(platform, architecture);
    }

    public string PlatformDescription { get; }

    public ReleaseAsset? SelectAsset(LatestRelease release)
    {
        ArgumentNullException.ThrowIfNull(release);

        if (string.IsNullOrEmpty(assetName))
        {
            return null;
        }

        return release.Assets.FirstOrDefault(
            asset => string.Equals(asset.Name, assetName, StringComparison.OrdinalIgnoreCase));
    }

    private static string DescribePlatform(OSPlatform platform, Architecture architecture)
    {
        var osLabel = platform == OSPlatform.Windows ? "windows"
            : platform == OSPlatform.OSX ? "darwin"
            : platform == OSPlatform.Linux ? "linux"
            : platform.ToString().ToLowerInvariant();

        var archLabel = architecture switch
        {
            Architecture.X64 => "x64",
            Architecture.Arm64 => "arm64",
            Architecture.X86 => "x86",
            Architecture.Arm => "arm",
            _ => architecture.ToString().ToLowerInvariant(),
        };

        return $"{osLabel}-{archLabel}";
    }

    private static string ResolveAssetName(OSPlatform platform, Architecture architecture)
    {
        if (platform == OSPlatform.Windows && architecture == Architecture.X64)
        {
            return "jukebox-media-server-windows-x64.zip";
        }

        if (platform == OSPlatform.OSX && architecture == Architecture.Arm64)
        {
            return "jukebox-media-server-darwin-arm64.tar.gz";
        }

        if (platform == OSPlatform.Linux && architecture == Architecture.X64)
        {
            return "jukebox-media-server-linux-x64.tar.gz";
        }

        return string.Empty;
    }
}
