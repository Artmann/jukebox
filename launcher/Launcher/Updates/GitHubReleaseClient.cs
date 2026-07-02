using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Updates;

public sealed class GitHubReleaseClient : IGitHubReleaseClient
{
    public const string DefaultRepositoryEndpoint =
        "https://api.github.com/repos/Artmann/jukebox/releases?per_page=30";

    public const string ServerTagPrefix = "jukebox-media-server-v";

    private readonly string endpoint;
    private readonly HttpClient httpClient;

    public GitHubReleaseClient(HttpClient httpClient)
        : this(httpClient, DefaultRepositoryEndpoint)
    {
    }

    public GitHubReleaseClient(HttpClient httpClient, string endpoint)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentException.ThrowIfNullOrWhiteSpace(endpoint);

        this.httpClient = httpClient;
        this.endpoint = endpoint;
    }

    public async Task<LatestRelease?> GetLatestServerReleaseAsync(CancellationToken cancellationToken)
    {
        using var response = await httpClient
            .GetAsync(endpoint, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        var releases = await response.Content
            .ReadFromJsonAsync<List<GitHubRelease>>(cancellationToken)
            .ConfigureAwait(false);

        if (releases is null)
        {
            return null;
        }

        var serverReleases = releases
            .Where(release => !release.Draft && !release.Prerelease)
            .Where(release => !string.IsNullOrEmpty(release.TagName))
            .Where(release => release.TagName!.StartsWith(ServerTagPrefix, StringComparison.Ordinal))
            .Select(release => new
            {
                Release = release,
                Version = release.TagName![ServerTagPrefix.Length..],
            })
            .Where(item => SemVerComparer.IsValid(item.Version))
            .OrderByDescending(item => item.Version, SemVerComparer.Instance)
            .ToList();

        if (serverReleases.Count == 0)
        {
            return null;
        }

        var top = serverReleases[0];

        var assets = (top.Release.Assets ?? new List<GitHubAsset>())
            .Where(asset => !string.IsNullOrEmpty(asset.Name) && !string.IsNullOrEmpty(asset.BrowserDownloadUrl))
            .Select(asset => new ReleaseAsset(asset.Name!, asset.BrowserDownloadUrl!, asset.Size))
            .ToList();

        return new LatestRelease(top.Release.TagName!, top.Version, assets);
    }

    private sealed class GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string? TagName { get; set; }

        [JsonPropertyName("draft")]
        public bool Draft { get; set; }

        [JsonPropertyName("prerelease")]
        public bool Prerelease { get; set; }

        [JsonPropertyName("assets")]
        public List<GitHubAsset>? Assets { get; set; }
    }

    private sealed class GitHubAsset
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("browser_download_url")]
        public string? BrowserDownloadUrl { get; set; }

        [JsonPropertyName("size")]
        public long Size { get; set; }
    }
}
