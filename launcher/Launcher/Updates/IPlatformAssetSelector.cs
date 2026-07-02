namespace Jukebox.Launcher.Updates;

public interface IPlatformAssetSelector
{
    string PlatformDescription { get; }

    ReleaseAsset? SelectAsset(LatestRelease release);
}
