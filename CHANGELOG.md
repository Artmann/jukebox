# Changelog

## [0.6.0](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.5.2...jukebox-media-server-v0.6.0) (2026-07-03)


### Features

* add server auto-update pipeline to launcher ([246ee8f](https://github.com/Artmann/jukebox/commit/246ee8f1e5adc350f5176027a597a2308adc3304))
* **launcher:** add process abstraction over System.Diagnostics.Process ([5071f8c](https://github.com/Artmann/jukebox/commit/5071f8cb51fbc5f2dacc998609414648cf5b5e2d))
* **launcher:** add server log file rotation ([9a33ae8](https://github.com/Artmann/jukebox/commit/9a33ae813acac134769595cac226e97d33facdb7))
* **launcher:** add server process manager with start/stop and orphan handling ([7a33042](https://github.com/Artmann/jukebox/commit/7a33042046626a50abf994096c8ea1b42ee78f5b))
* **launcher:** locate installed server executable ([628fe69](https://github.com/Artmann/jukebox/commit/628fe6914d8575629ba9b6451c5919f2dfec601b))
* **launcher:** restart crashed server with backoff and give-up threshold ([58f92d0](https://github.com/Artmann/jukebox/commit/58f92d01a22749b8024cfa5a848a82dbd26698b1))
* **launcher:** show live server state in the About window ([b3376df](https://github.com/Artmann/jukebox/commit/b3376dfcaad1d0c20dbac56236122883829bda99))
* **launcher:** start installed server on launch and stop on quit ([8a915f9](https://github.com/Artmann/jukebox/commit/8a915f953f51fa104806ccf8e8fba3d41e3713f3))
* **launcher:** stop and restart server around update installs ([3dbe97e](https://github.com/Artmann/jukebox/commit/3dbe97e80555893476a7cd55b7cab4cba613741a))


### Bug Fixes

* bundle bun-sqlite drizzle driver into compiled executable ([255d1cc](https://github.com/Artmann/jukebox/commit/255d1cc214a824746e55659e45148b4855bdaff3))
* detect modern bunfs virtual paths in compiled executables ([c3e2bd9](https://github.com/Artmann/jukebox/commit/c3e2bd921c35ac26ad8aead54f322ba1a8a5cb83)), closes [#32](https://github.com/Artmann/jukebox/issues/32)
* **launcher:** always restart server after update once stop is attempted ([b6dca1d](https://github.com/Artmann/jukebox/commit/b6dca1d2b80a40e722a7a267778f2664855b9fca))
* **launcher:** dispose About view model when the window closes ([c40f061](https://github.com/Artmann/jukebox/commit/c40f06118821230b2f56485c23d7d4adaba2a3dd))
* **launcher:** dispose crashed server process and harden orphan path check ([2061808](https://github.com/Artmann/jukebox/commit/2061808648953e46262558d478566f7b1b03e9aa))
* **launcher:** do not restart server when update is cancelled by quit ([027f217](https://github.com/Artmann/jukebox/commit/027f21774b841294b64ded57b5d8938d420a3c93))
* **launcher:** guarantee Stopped state even if termination throws ([8048a41](https://github.com/Artmann/jukebox/commit/8048a41b9d3cf6f002d32186cd36b9ffb03b8ea2))
* **launcher:** release log writer before reading in process factory test ([1750468](https://github.com/Artmann/jukebox/commit/175046892250623693a6b6692d83ee0cb229f2a0))
* **launcher:** run view model event tests on the headless UI thread ([897d2cb](https://github.com/Artmann/jukebox/commit/897d2cb4b4f52f3045186581f16785bd9c5c8e7b))
* **launcher:** stop during restart backoff no longer resurrects the server ([93d2d76](https://github.com/Artmann/jukebox/commit/93d2d7645fdccc9ce4002c865a098eb7c6e63e47))
* **launcher:** stop showing server version as launcher latest in About ([dc9e4a5](https://github.com/Artmann/jukebox/commit/dc9e4a555d65b9d33c0cfa756cff5718713934c6))
* **launcher:** synchronize log writer disposal and drain process output ([2240f05](https://github.com/Artmann/jukebox/commit/2240f054be9f31a9bcbc700f47cacd555cbbedb8))
* **launcher:** use untimed HttpClient for archive downloads ([67fe16d](https://github.com/Artmann/jukebox/commit/67fe16d5a5634db29aaef099fcf4628fefde945d))
* route drizzle import casts through unknown for typecheck ([fdc1aa0](https://github.com/Artmann/jukebox/commit/fdc1aa0fb84bd67f4a57c5d421bdfda8a188cc46))


### Documentation

* add server process management design spec ([b6a27d4](https://github.com/Artmann/jukebox/commit/b6a27d4dc1f4d4861ccffc47e2397f4059adaff1))
* add server process management implementation plan ([a5a62de](https://github.com/Artmann/jukebox/commit/a5a62de34b67b0fb307b9fc08567cf12c874f7ce))

## [0.5.2](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.5.1...jukebox-media-server-v0.5.2) (2026-05-21)


### Documentation

* update README to remove TMDB API key requirement ([#29](https://github.com/Artmann/jukebox/issues/29)) ([bf0f088](https://github.com/Artmann/jukebox/commit/bf0f08810c0078f217691489e84e656e3d5c3d64))

## [0.5.1](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.5.0...jukebox-media-server-v0.5.1) (2026-05-19)


### Bug Fixes

* trigger executable build from release-please workflow ([#26](https://github.com/Artmann/jukebox/issues/26)) ([16f83ac](https://github.com/Artmann/jukebox/commit/16f83ac63f52ecc1c7e973100cc5dd5570a7e339))

## [0.5.0](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.4.0...jukebox-media-server-v0.5.0) (2026-05-19)


### Features

* build standalone executables on release via bun compile ([#25](https://github.com/Artmann/jukebox/issues/25)) ([16e2492](https://github.com/Artmann/jukebox/commit/16e2492c2fea8104b8f249f0d44e19c5f220e1a2))


### Bug Fixes

* episode drawer fits above toolbar with auto-scroll and clearer progress ([0b57f33](https://github.com/Artmann/jukebox/commit/0b57f335328668b58a3494851aa2d6941ee83481))

## [0.4.0](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.3.0...jukebox-media-server-v0.4.0) (2026-04-19)


### Features

* server-side directory browser for library paths ([9c852ac](https://github.com/Artmann/jukebox/commit/9c852ac6616187a9f303294ed4c6ef1156ce31c1))


### Bug Fixes

* add back button to scan page ([315bab9](https://github.com/Artmann/jukebox/commit/315bab9305e0aee321d0e8ae7219e81953ab8c85)), closes [#20](https://github.com/Artmann/jukebox/issues/20)


### Refactoring

* rename tmdb service to metadata, dedupe continue-watching by show ([9c11612](https://github.com/Artmann/jukebox/commit/9c1161281898ce26a24aea17b05ceeecd280d896))

## [0.3.0](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.2.0...jukebox-media-server-v0.3.0) (2026-04-18)


### Features

* scan status indicator in header + periodic background scans ([#15](https://github.com/Artmann/jukebox/issues/15)) ([7c82f4c](https://github.com/Artmann/jukebox/commit/7c82f4c3f83c5c225159d75afa95b7f75cfe8dc0))
* Settings page with TMDB, Libraries, and Scan schedule sections ([#14](https://github.com/Artmann/jukebox/issues/14)) ([185224d](https://github.com/Artmann/jukebox/commit/185224d1996dadc8c8f61eb228132033fcf9381e))
* subtitle sidecar detection and in-player track selector ([#17](https://github.com/Artmann/jukebox/issues/17)) ([9e7ad59](https://github.com/Artmann/jukebox/commit/9e7ad5920e16273a5fa0e5cece8e738b924f121c))


### Bug Fixes

* hide episode panel sheet overlay on desktop breakpoint ([8d0b552](https://github.com/Artmann/jukebox/commit/8d0b5521a48db5fedf2f3d4ef69ca0d0cc744c1b))
* keep controls visible in fullscreen, add next-episode button, drag-to-seek ([8a37064](https://github.com/Artmann/jukebox/commit/8a37064fa4f4f64a4bb600d0f205b29c707df2fe))
* next-episode goes to the linear next, restarts if already finished ([bd829a2](https://github.com/Artmann/jukebox/commit/bd829a2102466339ab3ddca40c1ec17aab17e876))
* only mount the episode sheet on mobile ([10c69c1](https://github.com/Artmann/jukebox/commit/10c69c12b2d54e0c9bf52ba478fa7fdb66c1170e))

## [0.2.0](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.1.1...jukebox-media-server-v0.2.0) (2026-04-16)


### Features

* Chromecast and AirPlay casting ([#9](https://github.com/Artmann/jukebox/issues/9)) ([2e7eef0](https://github.com/Artmann/jukebox/commit/2e7eef0478584d03bc7fa34000e22cefa016689e))
* mobile-friendly UI and installable PWA ([#8](https://github.com/Artmann/jukebox/issues/8)) ([7f149ba](https://github.com/Artmann/jukebox/commit/7f149ba5dbb13602f614b8eb977f128ac036188d))
* Netflix-style profiles with per-profile progress and favorites ([5d45527](https://github.com/Artmann/jukebox/commit/5d4552763ec21a3b71cb804a01151b3f5b836c3d))
* Next Up and auto-advance for TV ([#7](https://github.com/Artmann/jukebox/issues/7)) ([b662700](https://github.com/Artmann/jukebox/commit/b6627001a9e5deea3782b3124355286e5bb6ec57))
* shared-password auth with DB-backed sessions ([#10](https://github.com/Artmann/jukebox/issues/10)) ([17638c8](https://github.com/Artmann/jukebox/commit/17638c8e0a6af4de48e4a21237b3feea4d185dca))
* volume up/down arrow keys with on-screen indicator ([#13](https://github.com/Artmann/jukebox/issues/13)) ([4c83e3e](https://github.com/Artmann/jukebox/commit/4c83e3efffda3abf53dced0ba1b8ce7f5b19ae9e))


### Bug Fixes

* close episode drawer when selecting an episode ([9a62964](https://github.com/Artmann/jukebox/commit/9a62964a4d6aae9e437ea59ba479fac3f20b05ea))
* dynamically import vite so production npx install works ([79bc756](https://github.com/Artmann/jukebox/commit/79bc7564b6f44910ed844ff08b4983fed5332f42))
* fill play/pause button icons ([12eecb9](https://github.com/Artmann/jukebox/commit/12eecb9718da537fd67cd3138b7ce5261e3bc1c5))
* remove header logo from keyboard tab order ([f8b2d09](https://github.com/Artmann/jukebox/commit/f8b2d09d54b09db31d3420fc6b7bdfba77e79f7f))

## [0.1.1](https://github.com/Artmann/jukebox/compare/jukebox-media-server-v0.1.0...jukebox-media-server-v0.1.1) (2026-04-14)


### Bug Fixes

* clean up startup output and force production mode in bin ([a42bb6a](https://github.com/Artmann/jukebox/commit/a42bb6af9b6b22a5f53eb87b56e25f8aaa8f0bbb))
* keep request logger enabled in production ([2a41605](https://github.com/Artmann/jukebox/commit/2a41605329354f74389b2f158e065d3fee461da4))
