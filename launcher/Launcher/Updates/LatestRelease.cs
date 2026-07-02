using System.Collections.Generic;

namespace Jukebox.Launcher.Updates;

public sealed record LatestRelease(
    string Tag,
    string Version,
    IReadOnlyList<ReleaseAsset> Assets);
