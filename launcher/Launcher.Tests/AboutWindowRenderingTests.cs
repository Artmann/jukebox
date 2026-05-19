using System.Linq;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using Jukebox.Launcher.ViewModels;
using Jukebox.Launcher.Views;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AboutWindowRenderingTests
{
    [AvaloniaFact]
    public void RendersVersionFromViewModel()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel("1.2.3"),
        };

        window.Show();

        var textBlocks = window
            .GetVisualDescendants()
            .OfType<TextBlock>()
            .Select(block => block.Text)
            .ToArray();

        Assert.Equal("About Jukebox", window.Title);
        Assert.Contains("Jukebox", textBlocks);
        Assert.Contains("Version 1.2.3", textBlocks);
        Assert.Contains("Self-hosted media server", textBlocks);

        window.Close();
    }

    [AvaloniaFact]
    public void CloseButtonClosesTheWindow()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel("9.9.9"),
        };

        window.Show();

        var closeButton = window
            .GetVisualDescendants()
            .OfType<Button>()
            .Single(button => Equals(button.Content, "Close"));

        var closed = false;
        window.Closed += (_, _) => closed = true;

        closeButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

        Assert.True(closed);
    }
}
