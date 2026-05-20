using System;
using System.IO;
using System.Text.RegularExpressions;
using Jukebox.Launcher.Version;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class PackageJsonVersionReaderTests
{
    [Fact]
    public void ReadsVersionFromValidPackageJson()
    {
        var json = """{ "name": "jukebox", "version": "0.5.1" }""";

        Assert.Equal("0.5.1", PackageJsonVersionReader.Read(json));
    }

    [Fact]
    public void SupportsPrereleaseAndBuildMetadata()
    {
        var json = """{ "version": "1.0.0-beta.2+build.7" }""";

        Assert.Equal("1.0.0-beta.2+build.7", PackageJsonVersionReader.Read(json));
    }

    [Fact]
    public void ThrowsActionableErrorWhenVersionMissing()
    {
        var json = """{ "name": "jukebox" }""";

        var error = Assert.Throws<InvalidOperationException>(
            () => PackageJsonVersionReader.Read(json));

        Assert.Contains("missing", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SemVer", error.Message);
    }

    [Fact]
    public void ThrowsWhenVersionIsNotAString()
    {
        var json = """{ "version": 1 }""";

        var error = Assert.Throws<InvalidOperationException>(
            () => PackageJsonVersionReader.Read(json));

        Assert.Contains("must be a string", error.Message);
    }

    [Fact]
    public void RoundTripsAgainstRepoPackageJson()
    {
        var packageJsonPath = LocateRepoPackageJson();
        var contents = File.ReadAllText(packageJsonPath);

        var version = PackageJsonVersionReader.Read(contents);

        Assert.Matches(new Regex(@"^\d+\.\d+\.\d+"), version);
    }

    private static string LocateRepoPackageJson()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "package.json");

            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException(
            "Could not locate the repo root package.json walking up from the test binary directory.");
    }
}
