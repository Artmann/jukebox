using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Jukebox.Launcher.Server;

public sealed class ServerInstallation : IServerInstallation
{
    private const string VersionFileName = "server-version.json";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    public ServerInstallation(string installDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(installDirectory);

        InstallDirectory = installDirectory;
    }

    public string InstallDirectory { get; }

    public InstalledServer? GetInstalled()
    {
        var path = Path.Combine(InstallDirectory, VersionFileName);

        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var contents = File.ReadAllText(path);
            var record = JsonSerializer.Deserialize<VersionFile>(contents, JsonOptions);

            if (record is null
                || string.IsNullOrWhiteSpace(record.Version)
                || string.IsNullOrWhiteSpace(record.Tag))
            {
                return null;
            }

            return new InstalledServer(record.Version, record.Tag, record.InstalledAt);
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine(
                $"Could not read {path}: {error.Message}. Treating server as not installed.");
            return null;
        }
    }

    public void WriteInstalled(InstalledServer installed)
    {
        ArgumentNullException.ThrowIfNull(installed);

        Directory.CreateDirectory(InstallDirectory);

        var path = Path.Combine(InstallDirectory, VersionFileName);
        var record = new VersionFile
        {
            Version = installed.Version,
            Tag = installed.Tag,
            InstalledAt = installed.InstalledAt,
        };

        File.WriteAllText(path, JsonSerializer.Serialize(record, JsonOptions));
    }

    private sealed class VersionFile
    {
        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;

        [JsonPropertyName("tag")]
        public string Tag { get; set; } = string.Empty;

        [JsonPropertyName("installedAt")]
        public DateTimeOffset InstalledAt { get; set; }
    }
}
