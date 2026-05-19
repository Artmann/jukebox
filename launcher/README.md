# Jukebox Launcher

Cross-platform tray-icon launcher for Jukebox. .NET 9 + Avalonia 11.

## Build

```sh
dotnet restore launcher/Launcher.sln
dotnet build   launcher/Launcher.sln -c Release
```

## Run

```sh
dotnet run --project launcher/Launcher
```

No main window appears — look for the tray / menu-bar icon. Right-click it for the About entry.

## Test

```sh
dotnet test launcher/Launcher.sln
```

UI tests use `Avalonia.Headless.XUnit` so they run without a display on all three OSes in CI.

Tests live in the sibling `Launcher.Tests/` project. This is the standard .NET convention; at project granularity it satisfies the repo's "tests next to implementation" guideline.

## Versioning

The version is injected at build time from the repo root `package.json`. There is no separate version file to update for the launcher.

## Autostart

The launcher registers itself to start on login the first time it runs (idempotent):

- **Windows** — `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- **macOS** — `~/Library/LaunchAgents/com.jukebox.launcher.plist`
- **Linux** — `~/.config/autostart/jukebox-launcher.desktop`

## Auto-update

Not implemented yet. The project is structured so [Velopack](https://github.com/velopack/velopack) (the maintained cross-platform successor to Squirrel) can be added later by hooking `VelopackApp.Build().Run()` at the top of `Program.Main` and packaging release artifacts with `vpk`.
