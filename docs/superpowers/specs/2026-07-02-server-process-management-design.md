# Server Process Management — Design

Date: 2026-07-02
Status: Draft, pending user review

## Purpose

The launcher installs and updates the jukebox media server but never runs it.
This feature makes the launcher the thing that keeps Jukebox alive: start the
installed server when the launcher starts, restart it if it crashes, stop it
when the launcher quits, and coordinate with the auto-updater so updates can
swap the install directory (which fails on Windows while the executable is
running).

## Decisions (assumed defaults — user was away; correct on review)

1. **Supervision level**: start on launch, stop on quit, and auto-restart on
   crash with backoff and a give-up threshold.
2. **Startup order**: start the installed server immediately for a fast path
   to playing music; the update check runs concurrently. The server is stopped
   only for the directory swap, then restarted.
3. **Tray/UI scope**: no new tray menu items. The About window gains one
   "server status" line. ("Open Jukebox" menu item, manual start/stop, and
   periodic update checks are out of scope.)
4. **Logs**: server stdout/stderr are appended to a log file with simple
   size-based rotation, so crashes are diagnosable.

## Approaches considered

- **A. In-launcher supervisor using `System.Diagnostics.Process` (chosen)** —
  one cross-platform code path, fits the existing DI and test patterns, and
  the launcher already owns the server's lifecycle conceptually (install,
  update, About display).
- **B. OS-native services (Windows service / launchd agent / systemd unit)** —
  survives launcher crashes, but requires three platform-specific
  integrations, elevation/installation flows, and fights the tray-app model
  where quitting the launcher should stop the server.
- **C. Start/stop without supervision** — simpler, but a crashed server stays
  silently dead, which contradicts "keep it running".

## Environment facts the design relies on

- Release archives extract to `<installDir>/jukebox-media-server-<target>/`
  containing `jukebox-media-server` (`.exe` on Windows), `dist/client/`,
  `drizzle/` (see `scripts/build-executable.ts`).
- The server listens on port 1990 by default (`src/index.ts:19`) and stores
  its data in `~/.jukebox/` — independent of the install directory, so
  replacing the install never touches user data.
- The server shuts down gracefully on `SIGINT`/`SIGTERM`
  (`src/index.ts:120-121`).
- `ServerUpdater.InstallAsync` swaps the install directory with
  `Directory.Move` (`launcher/Launcher/Server/ServerUpdater.cs:169-186`);
  on Windows this throws while the server executable is running.

## Components

All new code lives in `launcher/Launcher/Server/` unless noted.

### ServerExecutableLocator

`IServerExecutableLocator.Locate()` returns the full path of the server
executable inside `IServerInstallation.InstallDirectory`, or `null`. It looks
in the install directory root and in any `jukebox-media-server-*`
subdirectory for `jukebox-media-server.exe` (Windows) or
`jukebox-media-server` (elsewhere).

### Process abstraction

`IProcessFactory` / `IManagedProcess` — a thin wrapper over
`System.Diagnostics.Process` exposing exactly what the supervisor needs:
start with redirected stdout/stderr, an exited event/awaitable, `Kill`,
graceful signal on Unix, process id. The real implementation is
`SystemProcessFactory`; tests use fakes so the supervision logic (backoff,
give-up, state transitions) is unit-testable without spawning processes.

### ServerProcessManager

`IServerProcessManager` — the supervisor. Singleton in DI.

- `Task StartAsync(CancellationToken)` — locate the executable and spawn it
  with the working directory set to the executable's directory. If nothing is
  installed, the state becomes `NotInstalled` and nothing else happens (the
  updater's first install will start it via the update gate).
- `Task StopAsync(CancellationToken)` — deliberate stop: suppresses
  supervision, then Unix: `SIGTERM`, 5 seconds grace, then kill;
  Windows: `Process.Kill(entireProcessTree: true)`.
- `ServerProcessState State` — `NotInstalled`, `Stopped`, `Starting`,
  `Running`, `Restarting`, `Failed` — plus a `StateChanged` event carrying the
  state and a human-readable detail string.
- **Supervision**: when the process exits without a deliberate stop, restart
  after backoff delays of 1, 2, 5, 15, 30 seconds. If it crashes 5 times
  within 2 minutes, give up: state `Failed` with the message
  "The server keeps crashing and has been stopped. Check the log at {logPath},
  then restart the launcher to try again."
- **Orphan handling**: the manager writes `server.pid` next to the install
  directory. On `StartAsync`, if the PID file names a live process whose
  executable path is inside our install directory, kill it first (an orphan
  from a crashed launcher), then start fresh. Stale or foreign PIDs are
  ignored and the file is overwritten.
- **Logging**: stdout and stderr are appended to `logs/server.log` under the
  per-OS Jukebox data root (same root `ServerInstallationFactory` uses). At
  startup, if the log exceeds 5 MB it is rotated to `server.log.old`
  (replacing any previous one).

### Update coordination — IServerProcessGate

A small interface implemented by `ServerProcessManager`:

- `Task StopForUpdateAsync(CancellationToken)` — deliberate stop, supervision
  suppressed.
- `Task StartAfterUpdateAsync(CancellationToken)` — re-locate the executable
  (the path contains the target-named folder and may change) and start,
  supervision resumed.

`ServerUpdater` accepts an optional `IServerProcessGate` (null keeps today's
behavior for existing tests). In `InstallAsync` it calls `StopForUpdateAsync`
after download + extraction succeed, immediately before the directory swap —
keeping the server offline only for the swap itself — and calls
`StartAfterUpdateAsync` after the version file is written, or after rollback
in the failure path. First install gets started the same way.

### Wiring

- `Program.cs` registers `IServerExecutableLocator`, `IProcessFactory`, and
  `ServerProcessManager` (as both `IServerProcessManager` and
  `IServerProcessGate`), and passes the gate into `IServerUpdater`.
- `App.OnFrameworkInitializationCompleted` calls `StartAsync` on a background
  task before `StartBackgroundUpdateCheck`, and stops the server on
  `ShutdownRequested` (bounded wait, 5 seconds, so quit never hangs).
- `AboutViewModel` takes an optional `IServerProcessManager`, subscribes to
  `StateChanged` (marshalled through the existing `RunOnUiThread`), and
  exposes `ServerStateDisplay` ("Server running", "Server stopped",
  "Server restarting…", the failure message, empty when not installed).
  `AboutWindow.axaml` gets one new row bound to it. Disposal unsubscribes.

## Error messages (user-facing, exact)

- Executable missing after an apparently valid install:
  "Server executable not found in {installDirectory}. Restart the launcher to
  repair the installation."
- Start failure (spawn throws):
  "Couldn't start the server: {reason}. Check the log at {logPath}."
- Crash loop give-up:
  "The server keeps crashing and has been stopped. Check the log at {logPath},
  then restart the launcher to try again."

## Testing

Following the existing patterns (xunit, `TempDirectory`, fakes over mocks):

- `ServerExecutableLocatorTests` — finds the binary in a target-named
  subdirectory, prefers the platform name, returns null when absent.
- `ServerProcessManagerTests` — with a fake `IProcessFactory`: start reaches
  `Running`; unexpected exit restarts with backoff; 5 crashes in the window
  reaches `Failed` with the exact message; `StopAsync` suppresses restart;
  gate stop/start round-trips; PID-file orphan is killed only when its path
  is inside the install directory.
- `ServerUpdaterTests` additions — the gate is stopped before the swap and
  started after success and after rollback; null gate keeps current behavior.
- Log rotation test — an oversized `server.log` is rotated on start.
- One real-process smoke test per OS-safe command (e.g. spawn `cmd /c exit 0`
  on Windows, `/bin/sh -c 'exit 0'` elsewhere) to validate
  `SystemProcessFactory` plumbing.

## Out of scope (follow-ups)

- "Open Jukebox" tray menu item (browser to `http://localhost:1990`)
- Manual start/stop tray controls
- Periodic or manual update checks
- Launcher self-update
- Configurable server port
