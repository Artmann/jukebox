using System.Linq;
using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.VisualTree;

namespace Jukebox.Launcher.Tests;

internal static class UiQueries
{
    public static T GetByTestId<T>(this Visual root, string testId)
        where T : Control
    {
        var matches = root
            .GetVisualDescendants()
            .OfType<T>()
            .Where(control => AutomationProperties.GetAutomationId(control) == testId)
            .ToArray();

        if (matches.Length == 0)
        {
            throw new TestElementNotFoundException(
                $"No {typeof(T).Name} found with AutomationId '{testId}'. "
                + "Check that the AXAML sets AutomationProperties.AutomationId on the element.");
        }

        if (matches.Length > 1)
        {
            throw new TestElementNotFoundException(
                $"Found {matches.Length} {typeof(T).Name} elements with AutomationId '{testId}'. "
                + "Test IDs must be unique within a window.");
        }

        return matches[0];
    }

    public static T? QueryByTestId<T>(this Visual root, string testId)
        where T : Control
        => root
            .GetVisualDescendants()
            .OfType<T>()
            .FirstOrDefault(control => AutomationProperties.GetAutomationId(control) == testId);
}

internal sealed class TestElementNotFoundException : System.Exception
{
    public TestElementNotFoundException(string message) : base(message)
    {
    }
}
