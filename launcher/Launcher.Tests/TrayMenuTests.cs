using System.Linq;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;

namespace Jukebox.Launcher.Tests;

public class TrayMenuTests
{
    [AvaloniaFact]
    public void TrayIconExposesAboutAndQuitMenuItems()
    {
        var icons = TrayIcon.GetIcons(Avalonia.Application.Current!);
        Xunit.Assert.NotNull(icons);
        var trayIcon = Xunit.Assert.Single(icons!);

        Xunit.Assert.Equal("Jukebox", trayIcon.ToolTipText);

        var menu = trayIcon.Menu;
        Xunit.Assert.NotNull(menu);

        var headers = menu!.Items
            .Select(item => item is NativeMenuItemSeparator ? "-" : ((NativeMenuItem)item).Header)
            .ToArray();

        Xunit.Assert.Equal(new[] { "About Jukebox", "-", "Quit" }, headers);
    }
}
