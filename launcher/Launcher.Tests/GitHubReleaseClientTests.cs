using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Jukebox.Launcher.Updates;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class GitHubReleaseClientTests
{
    [Fact]
    public async Task PicksHighestServerTag()
    {
        var json = """
        [
          {
            "tag_name": "jukebox-media-server-v0.5.0",
            "draft": false,
            "prerelease": false,
            "assets": []
          },
          {
            "tag_name": "jukebox-media-server-v0.5.1",
            "draft": false,
            "prerelease": false,
            "assets": [
              {
                "name": "jukebox-media-server-windows-x64.zip",
                "browser_download_url": "https://example/win.zip",
                "size": 12345
              }
            ]
          },
          {
            "tag_name": "jukebox-media-server-v0.4.0",
            "draft": false,
            "prerelease": false,
            "assets": []
          }
        ]
        """;

        var client = BuildClient(json, HttpStatusCode.OK);

        var release = await client.GetLatestServerReleaseAsync(CancellationToken.None);

        Assert.NotNull(release);
        Assert.Equal("jukebox-media-server-v0.5.1", release!.Tag);
        Assert.Equal("0.5.1", release.Version);
        Assert.Single(release.Assets);
        Assert.Equal("jukebox-media-server-windows-x64.zip", release.Assets[0].Name);
        Assert.Equal("https://example/win.zip", release.Assets[0].DownloadUrl);
        Assert.Equal(12345, release.Assets[0].SizeBytes);
    }

    [Fact]
    public async Task IgnoresDraftsAndPrereleasesAndOtherTagPrefixes()
    {
        var json = """
        [
          {
            "tag_name": "jukebox-media-server-v0.9.0",
            "draft": true,
            "prerelease": false,
            "assets": []
          },
          {
            "tag_name": "jukebox-media-server-v0.8.0",
            "draft": false,
            "prerelease": true,
            "assets": []
          },
          {
            "tag_name": "some-other-package-v9.9.9",
            "draft": false,
            "prerelease": false,
            "assets": []
          },
          {
            "tag_name": "jukebox-media-server-v0.5.1",
            "draft": false,
            "prerelease": false,
            "assets": []
          }
        ]
        """;

        var client = BuildClient(json, HttpStatusCode.OK);

        var release = await client.GetLatestServerReleaseAsync(CancellationToken.None);

        Assert.NotNull(release);
        Assert.Equal("0.5.1", release!.Version);
    }

    [Fact]
    public async Task ReturnsNullWhenNoMatchingReleases()
    {
        var json = """
        [
          { "tag_name": "some-other-v1.0.0", "draft": false, "prerelease": false, "assets": [] }
        ]
        """;

        var client = BuildClient(json, HttpStatusCode.OK);

        var release = await client.GetLatestServerReleaseAsync(CancellationToken.None);

        Assert.Null(release);
    }

    [Fact]
    public async Task ThrowsOnHttpError()
    {
        var client = BuildClient("", HttpStatusCode.InternalServerError);

        await Assert.ThrowsAsync<HttpRequestException>(
            () => client.GetLatestServerReleaseAsync(CancellationToken.None));
    }

    [Fact]
    public async Task ThrowsOnNetworkFailure()
    {
        var failingHandler = new FailingHandler(new HttpRequestException("Connection refused"));
        var httpClient = new HttpClient(failingHandler);
        var client = new GitHubReleaseClient(httpClient, "https://example.com/releases");

        await Assert.ThrowsAsync<HttpRequestException>(
            () => client.GetLatestServerReleaseAsync(CancellationToken.None));
    }

    private static GitHubReleaseClient BuildClient(string body, HttpStatusCode statusCode)
    {
        var handler = new CannedResponseHandler(body, statusCode);
        var httpClient = new HttpClient(handler);
        return new GitHubReleaseClient(httpClient, "https://example.com/releases");
    }

    private sealed class CannedResponseHandler : HttpMessageHandler
    {
        private readonly string body;
        private readonly HttpStatusCode statusCode;

        public CannedResponseHandler(string body, HttpStatusCode statusCode)
        {
            this.body = body;
            this.statusCode = statusCode;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
            };

            return Task.FromResult(response);
        }
    }

    private sealed class FailingHandler : HttpMessageHandler
    {
        private readonly Exception exception;

        public FailingHandler(Exception exception)
        {
            this.exception = exception;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            throw exception;
        }
    }
}
