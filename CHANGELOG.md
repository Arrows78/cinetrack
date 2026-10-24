# Changelog

## [0.5.0](https://github.com/Arrows78/cinetrack/compare/v0.4.0...v0.5.0) (2026-10-24)


### Features

* **desktop:** configure the in-app update channel and publish latest.json with each release ([a252c10](https://github.com/Arrows78/cinetrack/commit/a252c10c67d85924ec161e984178cf076625fda4))


### Bug fixes

* **ci:** take the newly published rustls-webpki, webpki-roots, ctutils and zod fixes and give each scanner the ignores it actually reads ([17bfd06](https://github.com/Arrows78/cinetrack/commit/17bfd0663c6ca00725cf378847882790f6b5dac4))
* **release:** export only the signing secrets that exist, an empty certificate variable made the macOS build fail ([2534884](https://github.com/Arrows78/cinetrack/commit/2534884bc09135fe0e2f9e5e4cd1a19af4e9f4d1))
* **release:** keep the gate, checksums and publish jobs from being skipped when release-please is ([5cb2b11](https://github.com/Arrows78/cinetrack/commit/5cb2b117dc5d8496fc331f14320d46065725ea0b))
* **release:** sync the Tauri and Cargo versions with a script instead of release-please's file updaters ([ea832e3](https://github.com/Arrows78/cinetrack/commit/ea832e3346026adcf180767f73ed08319534bdfc))
* **release:** wait for the CI and visual-regression runs of the released commit, not for a check run that appears only at the end of the CI ([23d72ba](https://github.com/Arrows78/cinetrack/commit/23d72baf5eb588755784cd03b296d1cdfc10e99b))

## [0.4.0](https://github.com/Arrows78/cinetrack/compare/v0.3.0...v0.4.0) (2026-10-24)


### Features

* **desktop:** configure the in-app update channel and publish latest.json with each release ([a252c10](https://github.com/Arrows78/cinetrack/commit/a252c10c67d85924ec161e984178cf076625fda4))


### Bug fixes

* **ci:** take the newly published rustls-webpki, webpki-roots, ctutils and zod fixes and give each scanner the ignores it actually reads ([17bfd06](https://github.com/Arrows78/cinetrack/commit/17bfd0663c6ca00725cf378847882790f6b5dac4))
* **release:** sync the Tauri and Cargo versions with a script instead of release-please's file updaters ([ea832e3](https://github.com/Arrows78/cinetrack/commit/ea832e3346026adcf180767f73ed08319534bdfc))
