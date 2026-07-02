using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Jukebox.Launcher.Updates;

public sealed partial class SemVerComparer : IComparer<string>
{
    public static readonly SemVerComparer Instance = new();

    public int Compare(string? left, string? right)
    {
        if (left is null && right is null)
        {
            return 0;
        }

        if (left is null)
        {
            return -1;
        }

        if (right is null)
        {
            return 1;
        }

        var leftParts = Parse(left);
        var rightParts = Parse(right);

        for (var index = 0; index < 3; index++)
        {
            var comparison = leftParts.Numbers[index].CompareTo(rightParts.Numbers[index]);

            if (comparison != 0)
            {
                return comparison;
            }
        }

        if (string.IsNullOrEmpty(leftParts.Prerelease) && !string.IsNullOrEmpty(rightParts.Prerelease))
        {
            return 1;
        }

        if (!string.IsNullOrEmpty(leftParts.Prerelease) && string.IsNullOrEmpty(rightParts.Prerelease))
        {
            return -1;
        }

        return string.Compare(leftParts.Prerelease, rightParts.Prerelease, StringComparison.Ordinal);
    }

    public static bool IsValid(string value)
    {
        return !string.IsNullOrWhiteSpace(value) && SemVerPattern().IsMatch(value);
    }

    public static bool IsNewer(string candidate, string baseline)
    {
        return Instance.Compare(candidate, baseline) > 0;
    }

    private static ParsedVersion Parse(string value)
    {
        var match = SemVerPattern().Match(value);

        if (!match.Success)
        {
            return new ParsedVersion(new[] { 0, 0, 0 }, string.Empty);
        }

        var numbers = new[]
        {
            int.Parse(match.Groups["major"].Value),
            int.Parse(match.Groups["minor"].Value),
            int.Parse(match.Groups["patch"].Value),
        };

        return new ParsedVersion(numbers, match.Groups["prerelease"].Value);
    }

    [GeneratedRegex(@"^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z\-\.]+))?(?:\+[0-9A-Za-z\-\.]+)?$")]
    private static partial Regex SemVerPattern();

    private sealed record ParsedVersion(int[] Numbers, string Prerelease);
}
