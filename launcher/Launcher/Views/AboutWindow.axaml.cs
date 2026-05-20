using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;

namespace Jukebox.Launcher.Views;

public partial class AboutWindow : Window
{
    public AboutWindow() => AvaloniaXamlLoader.Load(this);

    private void OnCloseClicked(object? sender, RoutedEventArgs eventArguments) => Close();
}
