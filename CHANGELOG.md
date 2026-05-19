# Changelog

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
