namespace Jukebox.Launcher.Server;

public enum ServerUpdateOutcome
{
    UpToDate,
    Updated,
    NoAssetForPlatform,
    NoNetwork,
    Failed,
}

public sealed record ServerUpdateResult(
    ServerUpdateOutcome Outcome,
    string? Version,
    string? Message);
