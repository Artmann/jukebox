using System;

namespace Jukebox.Launcher.Server;

public sealed record InstalledServer(string Version, string Tag, DateTimeOffset InstalledAt);
