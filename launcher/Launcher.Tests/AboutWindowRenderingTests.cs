using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Interactivity;
using Jukebox.Launcher.ViewModels;
using Jukebox.Launcher.Views;
using Xunit;

namespace Jukebox.Launcher.Tests;

public class AboutWindowRenderingTests
{
    [AvaloniaFact]
    public void RendersTitleAndVersionAndTagline()
    {
        var window = new AboutWindow
        {
            DataContext = new AboutViewModel("1.2.3"),
        };

        window.Show();

        Assert.Equal("About Jukebox", window.Title);
        Assert.Equal("Jukebox", window.GetByTestId<TextBlock>("about-title").Text);
        Assert.Equal("Version 1.2.3", window.GetByTestId<TextBlock>("about-version").Text);
        Assert.Equal("Self-hosted media server", window.GetByTestId<TextBlock>("about-tagline").Text);

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

        var closeButton = window.GetByTestId<Button>("about-close");
        Assert.Equal("Close", closeButton.Content);

        var closed = false;
        window.Closed += (_, _) => closed = true;

        closeButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

        Assert.True(closed);
    }
}
