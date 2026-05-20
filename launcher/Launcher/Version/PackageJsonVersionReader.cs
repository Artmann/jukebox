using System;
using System.Text.Json;

namespace Jukebox.Launcher.Version;

public static class PackageJsonVersionReader
{
    public static string Read(string packageJsonContents)
    {
        using var document = JsonDocument.Parse(packageJsonContents);

        if (!document.RootElement.TryGetProperty("version", out var versionElement))
        {
            throw new InvalidOperationException(
                "package.json is missing a \"version\" field. Add a SemVer string (e.g. \"0.5.1\") and rebuild.");
        }

        if (versionElement.ValueKind != JsonValueKind.String)
        {
            throw new InvalidOperationException(
                "package.json \"version\" must be a string. Set it to a SemVer string like \"0.5.1\".");
        }

        var value = versionElement.GetString();

        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                "package.json contains an empty \"version\". Set it to a SemVer string like \"0.5.1\".");
        }

        return value;
    }
}
